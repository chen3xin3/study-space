use std::io::{self, Read, Write};

use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const MAX_FRAME_PLAINTEXT: usize = 64 * 1024;
const NONCE_BYTES: usize = 24;
const TAG_BYTES: usize = 16;
const CODE_ALPHABET: &[u8; 32] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

pub fn generate_pairing_code() -> String {
    let mut seed = Vec::with_capacity(32);
    seed.extend_from_slice(Uuid::new_v4().as_bytes());
    seed.extend_from_slice(Uuid::new_v4().as_bytes());
    let digest = Sha256::digest(seed);
    let mut value = String::with_capacity(23);
    let mut bit_buffer = 0u16;
    let mut bit_count = 0u8;
    let mut emitted = 0usize;
    for byte in digest {
        bit_buffer = (bit_buffer << 8) | byte as u16;
        bit_count += 8;
        while bit_count >= 5 && emitted < 20 {
            bit_count -= 5;
            let index = ((bit_buffer >> bit_count) & 0x1f) as usize;
            if emitted > 0 && emitted % 5 == 0 {
                value.push('-');
            }
            value.push(CODE_ALPHABET[index] as char);
            emitted += 1;
        }
        if emitted == 20 {
            break;
        }
    }
    value
}

pub fn normalize_pairing_code(value: &str) -> io::Result<String> {
    let compact = value
        .chars()
        .filter(|character| !character.is_ascii_whitespace() && *character != '-')
        .map(|character| character.to_ascii_uppercase())
        .collect::<String>();
    if compact.len() != 20 || !compact.bytes().all(|byte| CODE_ALPHABET.contains(&byte)) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "pairing code must contain 20 supported characters",
        ));
    }
    Ok(compact)
}

pub fn encrypt_frame(secret: &str, plaintext: &[u8]) -> io::Result<Vec<u8>> {
    if plaintext.len() > MAX_FRAME_PLAINTEXT {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "encrypted frame is too large",
        ));
    }
    let cipher = cipher(secret)?;
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "frame encryption failed"))?;
    let mut frame = Vec::with_capacity(NONCE_BYTES + ciphertext.len());
    frame.extend_from_slice(&nonce);
    frame.extend_from_slice(&ciphertext);
    Ok(frame)
}

pub fn decrypt_frame(secret: &str, frame: &[u8]) -> io::Result<Vec<u8>> {
    if frame.len() < NONCE_BYTES + TAG_BYTES
        || frame.len() > NONCE_BYTES + TAG_BYTES + MAX_FRAME_PLAINTEXT
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "encrypted frame has an invalid size",
        ));
    }
    let cipher = cipher(secret)?;
    cipher
        .decrypt(
            XNonce::from_slice(&frame[..NONCE_BYTES]),
            &frame[NONCE_BYTES..],
        )
        .map_err(|_| {
            io::Error::new(
                io::ErrorKind::PermissionDenied,
                "encrypted frame authentication failed",
            )
        })
}

pub fn write_encrypted(writer: &mut impl Write, secret: &str, plaintext: &[u8]) -> io::Result<()> {
    let frame = encrypt_frame(secret, plaintext)?;
    writer.write_all(&(frame.len() as u32).to_be_bytes())?;
    writer.write_all(&frame)?;
    writer.flush()
}

pub fn read_encrypted(reader: &mut impl Read, secret: &str) -> io::Result<Vec<u8>> {
    let mut length = [0u8; 4];
    reader.read_exact(&mut length)?;
    let length = u32::from_be_bytes(length) as usize;
    if length < NONCE_BYTES + TAG_BYTES || length > NONCE_BYTES + TAG_BYTES + MAX_FRAME_PLAINTEXT {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "encrypted frame has an invalid size",
        ));
    }
    let mut frame = vec![0; length];
    reader.read_exact(&mut frame)?;
    decrypt_frame(secret, &frame)
}

fn cipher(secret: &str) -> io::Result<XChaCha20Poly1305> {
    if secret.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "encryption secret is empty",
        ));
    }
    let mut hasher = Sha256::new();
    hasher.update(b"study-space-lan-sync-v2\0");
    hasher.update(secret.as_bytes());
    XChaCha20Poly1305::new_from_slice(&hasher.finalize())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid encryption key"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_pairing_code_is_grouped_and_high_entropy() {
        let code = generate_pairing_code();
        let compact = code.replace('-', "");
        assert_eq!(compact.len(), 20);
        assert_eq!(code.len(), 23);
        assert!(compact
            .bytes()
            .all(|byte| b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ".contains(&byte)));
    }

    #[test]
    fn encrypted_frame_round_trips_without_exposing_plaintext() {
        let plaintext = b"private learning backup";
        let frame = encrypt_frame("ABCDE-FGHJK-MNPQR-STUVW", plaintext).unwrap();
        assert!(!frame
            .windows(plaintext.len())
            .any(|window| window == plaintext));
        assert_eq!(
            decrypt_frame("ABCDE-FGHJK-MNPQR-STUVW", &frame).unwrap(),
            plaintext
        );
    }

    #[test]
    fn wrong_pairing_code_cannot_decrypt_a_frame() {
        let frame = encrypt_frame("ABCDE-FGHJK-MNPQR-STUVW", b"manifest").unwrap();
        assert_eq!(
            decrypt_frame("ZZZZZ-YYYYY-XXXXX-WWWWW", &frame)
                .unwrap_err()
                .kind(),
            io::ErrorKind::PermissionDenied
        );
    }

    #[test]
    fn oversized_plaintext_is_rejected_before_encryption() {
        let input = vec![0; MAX_FRAME_PLAINTEXT + 1];
        assert_eq!(
            encrypt_frame("ABCDE-FGHJK-MNPQR-STUVW", &input)
                .unwrap_err()
                .kind(),
            io::ErrorKind::InvalidInput
        );
    }
}
