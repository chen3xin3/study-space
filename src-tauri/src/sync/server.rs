use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration as StdDuration;

use chrono::Utc;
use sha2::{Digest, Sha256};

use super::crypto::{read_encrypted, write_encrypted, MAX_FRAME_PLAINTEXT};
use super::session::SendSession;
use super::{SendSessionStatus, SyncManifest};

pub(crate) const REQUEST_CLAIM: u8 = 1;
pub(crate) const REQUEST_DOWNLOAD: u8 = 2;
pub(crate) const REQUEST_COMPLETE: u8 = 3;

pub struct RunningSyncServer {
    address: SocketAddr,
    session: Arc<Mutex<SendSession>>,
    shutdown: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    backup_path: PathBuf,
}

impl RunningSyncServer {
    pub fn start(backup_path: PathBuf, session: SendSession) -> io::Result<Self> {
        let address = SocketAddr::new(IpAddr::V4(discover_private_ipv4()?), 0);
        Self::start_on(backup_path, session, address)
    }

    pub(crate) fn start_on(
        backup_path: PathBuf,
        session: SendSession,
        bind_address: SocketAddr,
    ) -> io::Result<Self> {
        let listener = TcpListener::bind(bind_address)?;
        listener.set_nonblocking(true)?;
        let address = listener.local_addr()?;
        let session = Arc::new(Mutex::new(session));
        let worker_session = Arc::clone(&session);
        let shutdown = Arc::new(AtomicBool::new(false));
        let worker_shutdown = Arc::clone(&shutdown);
        let worker_backup = backup_path.clone();
        let worker = thread::spawn(move || {
            while !worker_shutdown.load(Ordering::Acquire) {
                if worker_session
                    .lock()
                    .map(|mut entry| {
                        entry.refresh(Utc::now());
                        entry.should_cleanup(Utc::now())
                    })
                    .unwrap_or(true)
                {
                    break;
                }
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let _ = stream.set_read_timeout(Some(StdDuration::from_secs(5)));
                        let _ = stream.set_write_timeout(Some(StdDuration::from_secs(30)));
                        let _ = handle_connection(&mut stream, &worker_backup, &worker_session);
                    }
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(StdDuration::from_millis(20));
                    }
                    Err(_) => {
                        if let Ok(mut entry) = worker_session.lock() {
                            entry.fail();
                        }
                        break;
                    }
                }
            }
        });
        Ok(Self {
            address,
            session,
            shutdown,
            worker: Some(worker),
            backup_path,
        })
    }

    pub fn address(&self) -> SocketAddr {
        self.address
    }

    pub fn status(&self) -> SendSessionStatus {
        self.session
            .lock()
            .map(|mut entry| {
                entry.refresh(Utc::now());
                entry.status()
            })
            .unwrap_or(SendSessionStatus::Failed)
    }

    pub fn manifest(&self) -> Option<SyncManifest> {
        self.session
            .lock()
            .ok()
            .map(|entry| entry.manifest().clone())
    }

    pub fn pairing_code(&self) -> Option<String> {
        self.session
            .lock()
            .ok()
            .map(|entry| entry.pairing_code().to_owned())
    }

    pub fn expires_at(&self) -> Option<chrono::DateTime<Utc>> {
        self.session.lock().ok().map(|entry| entry.expires_at())
    }

    pub fn stop(&mut self) {
        if let Ok(mut entry) = self.session.lock() {
            if !matches!(
                entry.status(),
                SendSessionStatus::Completed
                    | SendSessionStatus::Failed
                    | SendSessionStatus::Expired
            ) {
                entry.stop();
            }
        }
        self.shutdown.store(true, Ordering::Release);
        let _ = TcpStream::connect(self.address);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for RunningSyncServer {
    fn drop(&mut self) {
        self.stop();
        let _ = fs::remove_file(&self.backup_path);
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaimResponse {
    session_token: String,
    manifest: SyncManifest,
}

fn handle_connection(
    stream: &mut TcpStream,
    backup_path: &PathBuf,
    session: &Arc<Mutex<SendSession>>,
) -> io::Result<()> {
    let mut request_kind = [0u8; 1];
    stream.read_exact(&mut request_kind)?;
    match request_kind[0] {
        REQUEST_CLAIM => handle_claim(stream, session),
        REQUEST_DOWNLOAD => handle_download(stream, backup_path, session),
        REQUEST_COMPLETE => handle_complete(stream, session),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unknown sync request",
        )),
    }
}

fn handle_claim(stream: &mut TcpStream, session: &Arc<Mutex<SendSession>>) -> io::Result<()> {
    let pairing_code = session
        .lock()
        .map_err(|_| io::Error::other("session lock poisoned"))?
        .pairing_code()
        .to_owned();
    if !matches!(read_encrypted(stream, &pairing_code), Ok(request) if request == b"claim") {
        if let Ok(mut entry) = session.lock() {
            entry.reject_pairing_attempt(Utc::now());
        }
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "pairing failed",
        ));
    }
    let response = {
        let mut entry = session
            .lock()
            .map_err(|_| io::Error::other("session lock poisoned"))?;
        let manifest = entry.manifest().clone();
        let session_token = entry
            .claim(&pairing_code, Utc::now())
            .map_err(|_| io::Error::new(io::ErrorKind::PermissionDenied, "pairing failed"))?;
        ClaimResponse {
            session_token,
            manifest,
        }
    };
    let bytes = serde_json::to_vec(&response).map_err(io::Error::other)?;
    write_encrypted(stream, &pairing_code, &bytes)
}

fn handle_download(
    stream: &mut TcpStream,
    backup_path: &PathBuf,
    session: &Arc<Mutex<SendSession>>,
) -> io::Result<()> {
    let token = session
        .lock()
        .map_err(|_| io::Error::other("session lock poisoned"))?
        .session_token()
        .to_owned();
    if read_encrypted(stream, &token)? != b"download" {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "transfer authentication failed",
        ));
    }
    session
        .lock()
        .map_err(|_| io::Error::other("session lock poisoned"))?
        .begin_transfer(&token, Utc::now())
        .map_err(|_| {
            io::Error::new(
                io::ErrorKind::PermissionDenied,
                "transfer authentication failed",
            )
        })?;
    let mut file = File::open(backup_path)?;
    let mut buffer = vec![0u8; MAX_FRAME_PLAINTEXT];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        write_encrypted(stream, &token, &buffer[..read])?;
    }
    write_encrypted(stream, &token, &[])
}

fn handle_complete(stream: &mut TcpStream, session: &Arc<Mutex<SendSession>>) -> io::Result<()> {
    let token = session
        .lock()
        .map_err(|_| io::Error::other("session lock poisoned"))?
        .session_token()
        .to_owned();
    if read_encrypted(stream, &token)? != b"complete" {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "completion authentication failed",
        ));
    }
    session
        .lock()
        .map_err(|_| io::Error::other("session lock poisoned"))?
        .complete(&token)
        .map_err(|_| {
            io::Error::new(
                io::ErrorKind::PermissionDenied,
                "completion authentication failed",
            )
        })?;
    write_encrypted(stream, &token, b"completed")
}

#[cfg(test)]
pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn sha256_file(path: &PathBuf) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    io::copy(&mut file, &mut HashWriter(&mut hasher))?;
    Ok(hex::encode(hasher.finalize()))
}

struct HashWriter<'a>(&'a mut Sha256);
impl Write for HashWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.update(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub fn discover_private_ipv4() -> io::Result<Ipv4Addr> {
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.connect("192.0.2.1:80")?;
    match socket.local_addr()?.ip() {
        IpAddr::V4(address)
            if address.is_private() && !address.is_loopback() && !address.is_unspecified() =>
        {
            Ok(address)
        }
        _ => Err(io::Error::new(
            io::ErrorKind::AddrNotAvailable,
            "no private IPv4 address is available",
        )),
    }
}

#[cfg(test)]
mod encrypted_tests {
    use super::*;
    use crate::sync::crypto::{read_encrypted, write_encrypted};
    use crate::sync::{SendSessionStatus, SyncManifest};
    use chrono::Utc;
    use serde::Deserialize;
    use std::fs;
    use std::io::{Read, Write};

    const PAIRING_CODE: &str = "ABCDE-FGHJK-MNPQR-STUVW";
    const SESSION_TOKEN: &str = "session-token-with-high-entropy";

    struct Fixture {
        server: RunningSyncServer,
        backup: Vec<u8>,
        _temp: tempfile::TempDir,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct TestClaimResponse {
        session_token: String,
        manifest: SyncManifest,
    }

    impl Fixture {
        fn start() -> Self {
            let temp = tempfile::tempdir().unwrap();
            let backup = b"verified-backup-body".to_vec();
            let path = temp.path().join("sync.zip");
            fs::write(&path, &backup).unwrap();
            let manifest = SyncManifest {
                protocol_version: 1,
                app_version: "0.6.0".into(),
                device_name: "Study PC".into(),
                platform: "windows".into(),
                created_at: "2026-10-10T12:00:00Z".into(),
                byte_size: backup.len() as u64,
                attachment_count: 1,
                sha256: sha256_hex(&backup),
            };
            let session =
                SendSession::new_with_secrets(manifest, Utc::now(), PAIRING_CODE, SESSION_TOKEN);
            let server =
                RunningSyncServer::start_on(path, session, "127.0.0.1:0".parse().unwrap()).unwrap();
            Self {
                server,
                backup,
                _temp: temp,
            }
        }

        fn claim(&self, code: &str) -> io::Result<TestClaimResponse> {
            let mut stream = TcpStream::connect(self.server.address()).unwrap();
            stream.write_all(&[REQUEST_CLAIM])?;
            write_encrypted(&mut stream, code, b"claim")?;
            let bytes = read_encrypted(&mut stream, code)?;
            serde_json::from_slice(&bytes).map_err(io::Error::other)
        }

        fn download(&self, token: &str) -> io::Result<Vec<u8>> {
            let mut stream = TcpStream::connect(self.server.address()).unwrap();
            stream.write_all(&[REQUEST_DOWNLOAD])?;
            write_encrypted(&mut stream, token, b"download")?;
            let mut bytes = Vec::new();
            loop {
                let chunk = read_encrypted(&mut stream, token)?;
                if chunk.is_empty() {
                    break;
                }
                bytes.extend_from_slice(&chunk);
            }
            Ok(bytes)
        }

        fn complete(&self, token: &str) -> io::Result<()> {
            let mut stream = TcpStream::connect(self.server.address()).unwrap();
            stream.write_all(&[REQUEST_COMPLETE])?;
            write_encrypted(&mut stream, token, b"complete")?;
            assert_eq!(read_encrypted(&mut stream, token)?, b"completed");
            Ok(())
        }
    }

    #[test]
    fn wrong_pairing_secret_is_rejected_without_a_plaintext_response() {
        let _guard = crate::sync::network_test_guard();
        let fixture = Fixture::start();
        assert!(fixture.claim("ZZZZZ-YYYYY-XXXXX-WWWWW").is_err());
        assert_eq!(fixture.server.status(), SendSessionStatus::Waiting);
    }

    #[test]
    fn encrypted_claim_returns_token_and_snapshot_metadata_once() {
        let _guard = crate::sync::network_test_guard();
        let fixture = Fixture::start();
        let response = fixture.claim(PAIRING_CODE).unwrap();
        assert_eq!(response.session_token, SESSION_TOKEN);
        assert_eq!(response.manifest.device_name, "Study PC");
        assert!(fixture.claim(PAIRING_CODE).is_err());
    }

    #[test]
    fn encrypted_backup_streams_exact_verified_bytes() {
        let _guard = crate::sync::network_test_guard();
        let fixture = Fixture::start();
        fixture.claim(PAIRING_CODE).unwrap();
        assert!(fixture.download("wrong-token").is_err());
        assert_eq!(fixture.download(SESSION_TOKEN).unwrap(), fixture.backup);
        assert_eq!(fixture.server.status(), SendSessionStatus::Transferring);
    }

    #[test]
    fn completion_and_explicit_stop_end_the_session() {
        let _guard = crate::sync::network_test_guard();
        let fixture = Fixture::start();
        fixture.claim(PAIRING_CODE).unwrap();
        fixture.download(SESSION_TOKEN).unwrap();
        fixture.complete(SESSION_TOKEN).unwrap();
        assert_eq!(fixture.server.status(), SendSessionStatus::Completed);

        let mut stopped = Fixture::start();
        stopped.server.stop();
        assert_eq!(stopped.server.status(), SendSessionStatus::Stopped);
    }

    #[test]
    fn plaintext_http_is_never_served() {
        let _guard = crate::sync::network_test_guard();
        let fixture = Fixture::start();
        let mut stream = TcpStream::connect(fixture.server.address()).unwrap();
        stream
            .write_all(b"GET /v1/manifest HTTP/1.1\r\nHost: local\r\n\r\n")
            .unwrap();
        let mut bytes = Vec::new();
        let _ = stream.read_to_end(&mut bytes);
        assert!(!bytes.starts_with(b"HTTP/1.1"));
    }
}
