use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

use super::crypto::generate_pairing_code;
use super::{SendSessionStatus, SyncError, SyncManifest};

const SESSION_LIFETIME_MINUTES: i64 = 10;
const MAX_PAIRING_ATTEMPTS: u8 = 5;

#[derive(Debug)]
pub struct SendSession {
    manifest: SyncManifest,
    status: SendSessionStatus,
    pairing_code: String,
    session_token: String,
    expires_at: DateTime<Utc>,
    failed_attempts: u8,
    claimed: bool,
}

impl SendSession {
    pub fn new(manifest: SyncManifest, now: DateTime<Utc>) -> Self {
        let pairing_code = generate_pairing_code();
        let session_token = Uuid::new_v4().simple().to_string();
        Self::new_with_secrets(manifest, now, &pairing_code, &session_token)
    }

    pub(crate) fn new_with_secrets(
        manifest: SyncManifest,
        now: DateTime<Utc>,
        pairing_code: &str,
        session_token: &str,
    ) -> Self {
        Self {
            manifest,
            status: SendSessionStatus::Waiting,
            pairing_code: pairing_code.to_owned(),
            session_token: session_token.to_owned(),
            expires_at: now + Duration::minutes(SESSION_LIFETIME_MINUTES),
            failed_attempts: 0,
            claimed: false,
        }
    }

    pub fn manifest(&self) -> &SyncManifest {
        &self.manifest
    }

    pub fn pairing_code(&self) -> &str {
        &self.pairing_code
    }

    pub(crate) fn session_token(&self) -> &str {
        &self.session_token
    }

    pub fn expires_at(&self) -> DateTime<Utc> {
        self.expires_at
    }

    pub fn status(&self) -> SendSessionStatus {
        self.status
    }

    pub fn claim(&mut self, pairing_code: &str, now: DateTime<Utc>) -> Result<String, SyncError> {
        self.expire_if_needed(now);
        if self.status == SendSessionStatus::Expired {
            return Err(SyncError::Expired);
        }
        if self.claimed {
            return Err(SyncError::AlreadyClaimed);
        }
        if self.status != SendSessionStatus::Waiting {
            return Err(SyncError::InvalidState);
        }
        if pairing_code != self.pairing_code {
            self.failed_attempts += 1;
            if self.failed_attempts >= MAX_PAIRING_ATTEMPTS {
                self.status = SendSessionStatus::Failed;
                return Err(SyncError::TooManyAttempts);
            }
            return Err(SyncError::InvalidPairingCode);
        }
        self.claimed = true;
        Ok(self.session_token.clone())
    }

    pub fn begin_transfer(&mut self, token: &str, now: DateTime<Utc>) -> Result<(), SyncError> {
        self.expire_if_needed(now);
        if self.status == SendSessionStatus::Expired {
            return Err(SyncError::Expired);
        }
        self.verify_token(token)?;
        if self.status != SendSessionStatus::Waiting {
            return Err(SyncError::InvalidState);
        }
        self.status = SendSessionStatus::Transferring;
        Ok(())
    }

    pub fn complete(&mut self, token: &str) -> Result<(), SyncError> {
        self.verify_token(token)?;
        if self.status != SendSessionStatus::Transferring {
            return Err(SyncError::InvalidState);
        }
        self.status = SendSessionStatus::Completed;
        Ok(())
    }

    pub fn stop(&mut self) {
        self.status = SendSessionStatus::Stopped;
    }

    pub fn reject_pairing_attempt(&mut self, now: DateTime<Utc>) -> SyncError {
        self.expire_if_needed(now);
        if self.status == SendSessionStatus::Expired {
            return SyncError::Expired;
        }
        if self.claimed || self.status != SendSessionStatus::Waiting {
            return SyncError::InvalidState;
        }
        self.failed_attempts += 1;
        if self.failed_attempts >= MAX_PAIRING_ATTEMPTS {
            self.status = SendSessionStatus::Failed;
            SyncError::TooManyAttempts
        } else {
            SyncError::InvalidPairingCode
        }
    }

    pub fn fail(&mut self) {
        self.status = SendSessionStatus::Failed;
    }

    pub fn should_cleanup(&self, now: DateTime<Utc>) -> bool {
        now >= self.expires_at
            || matches!(
                self.status,
                SendSessionStatus::Completed
                    | SendSessionStatus::Stopped
                    | SendSessionStatus::Expired
                    | SendSessionStatus::Failed
            )
    }

    pub fn refresh(&mut self, now: DateTime<Utc>) {
        self.expire_if_needed(now);
    }

    fn verify_token(&self, token: &str) -> Result<(), SyncError> {
        if !self.claimed || token != self.session_token {
            return Err(SyncError::InvalidToken);
        }
        Ok(())
    }

    fn expire_if_needed(&mut self, now: DateTime<Utc>) {
        if now >= self.expires_at && matches!(self.status, SendSessionStatus::Waiting) {
            self.status = SendSessionStatus::Expired;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    fn now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 10, 12, 0, 0).unwrap()
    }

    fn manifest() -> SyncManifest {
        SyncManifest {
            protocol_version: 1,
            app_version: "0.6.0".into(),
            device_name: "Study PC".into(),
            platform: "windows".into(),
            created_at: "2026-10-10T12:00:00Z".into(),
            byte_size: 1024,
            attachment_count: 2,
            sha256: "ab".repeat(32),
        }
    }

    #[test]
    fn pairing_code_has_enough_entropy_for_encrypted_transfer() {
        let session = SendSession::new(manifest(), now());
        let compact = session.pairing_code().replace('-', "");
        assert_eq!(compact.len(), 20);
        assert!(compact
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit()));
        assert_eq!(
            session
                .pairing_code()
                .chars()
                .filter(|&ch| ch == '-')
                .count(),
            3
        );
    }

    #[test]
    fn pairing_code_can_only_be_claimed_once() {
        let mut session = SendSession::new_with_secrets(manifest(), now(), "381204", "token");
        assert_eq!(session.claim("381204", now()).unwrap(), "token");
        assert_eq!(
            session.claim("381204", now()).unwrap_err(),
            SyncError::AlreadyClaimed
        );
    }

    #[test]
    fn session_expires_after_ten_minutes() {
        let mut session = SendSession::new_with_secrets(manifest(), now(), "381204", "token");
        let expired_at = now() + chrono::Duration::minutes(10) + chrono::Duration::seconds(1);
        assert_eq!(
            session.claim("381204", expired_at).unwrap_err(),
            SyncError::Expired
        );
        assert_eq!(session.status(), SendSessionStatus::Expired);
    }

    #[test]
    fn five_wrong_codes_stop_the_session() {
        let mut session = SendSession::new_with_secrets(manifest(), now(), "381204", "token");
        for _ in 0..4 {
            assert_eq!(
                session.claim("000000", now()).unwrap_err(),
                SyncError::InvalidPairingCode
            );
        }
        assert_eq!(
            session.claim("000000", now()).unwrap_err(),
            SyncError::TooManyAttempts
        );
        assert_eq!(session.status(), SendSessionStatus::Failed);
    }

    #[test]
    fn claimed_session_transfers_and_completes() {
        let mut session = SendSession::new_with_secrets(manifest(), now(), "381204", "token");
        let token = session.claim("381204", now()).unwrap();
        session.begin_transfer(&token, now()).unwrap();
        assert_eq!(session.status(), SendSessionStatus::Transferring);
        session.complete(&token).unwrap();
        assert_eq!(session.status(), SendSessionStatus::Completed);
        assert!(session.should_cleanup(now()));
    }

    #[test]
    fn stopped_failed_and_expired_sessions_are_cleanup_candidates() {
        let mut stopped = SendSession::new_with_secrets(manifest(), now(), "381204", "token");
        stopped.stop();
        assert!(stopped.should_cleanup(now()));

        let mut failed = SendSession::new_with_secrets(manifest(), now(), "381204", "token");
        failed.fail();
        assert!(failed.should_cleanup(now()));

        let active = SendSession::new_with_secrets(manifest(), now(), "381204", "token");
        assert!(active.should_cleanup(now() + chrono::Duration::minutes(11)));
    }
}
