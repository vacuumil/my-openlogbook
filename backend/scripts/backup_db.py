"""
OpenLogBook - Automated Encrypted Database Backup & Restore Utility
Uses SQLite Online Backup API + AES-256-GCM authenticated encryption.
"""
import os
import sys
import gzip
import time
import glob
import sqlite3
import argparse
from datetime import datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import hashlib

# Derive encryption key
def get_encryption_key() -> bytes:
    key_material = os.getenv("ENCRYPTION_KEY") or os.environ["SECRET_KEY"]
    return hashlib.sha256(key_material.encode("utf-8")).digest()

def backup(db_path: str, backup_dir: str, keep_days: int = 14) -> str:
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database file not found: {db_path}")

    os.makedirs(backup_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_sqlite = os.path.join(backup_dir, f"temp_{timestamp}.sqlite")
    out_file = os.path.join(backup_dir, f"openlogbook_backup_{timestamp}.enc")

    print(f"[*] Starting live online backup of {db_path}...")
    # 1. SQLite safe online snapshot without locking writers
    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(temp_sqlite)
    with dst:
        src.backup(dst)
    dst.close()
    src.close()

    # 2. Compress with gzip in-memory
    with open(temp_sqlite, "rb") as f_in:
        compressed = gzip.compress(f_in.read())
    os.remove(temp_sqlite)

    # 3. Encrypt with AES-256-GCM
    key = get_encryption_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    encrypted = aesgcm.encrypt(nonce, compressed, None)

    # 4. Write encrypted payload (nonce + ciphertext + tag)
    with open(out_file, "wb") as f_out:
        f_out.write(b"OLB-ENC1")  # Magic header
        f_out.write(nonce)
        f_out.write(encrypted)

    size_kb = os.path.getsize(out_file) / 1024
    print(f"[+] Encrypted backup created successfully: {out_file} ({size_kb:.2f} KB)")

    # 5. Prune backups older than keep_days
    all_backups = sorted(glob.glob(os.path.join(backup_dir, "openlogbook_backup_*.enc")))
    now = time.time()
    for b in all_backups:
        if os.path.getmtime(b) < now - (keep_days * 86400):
            try:
                os.remove(b)
                print(f"[-] Pruned old backup: {b}")
            except Exception:
                pass

    return out_file

def restore(backup_file: str, target_db_path: str):
    if not os.path.exists(backup_file):
        raise FileNotFoundError(f"Backup file not found: {backup_file}")

    print(f"[*] Restoring from encrypted backup: {backup_file}...")
    with open(backup_file, "rb") as f:
        magic = f.read(8)
        if magic != b"OLB-ENC1":
            raise ValueError("Invalid backup file header (expected OLB-ENC1)")
        nonce = f.read(12)
        encrypted_data = f.read()

    key = get_encryption_key()
    aesgcm = AESGCM(key)
    compressed = aesgcm.decrypt(nonce, encrypted_data, None)
    decompressed = gzip.decompress(compressed)

    # Write target
    with open(target_db_path, "wb") as f_out:
        f_out.write(decompressed)

    print(f"[+] Database restored successfully to: {target_db_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OpenLogBook Encrypted Backup Utility")
    parser.add_argument("--db", default=os.getenv("SQLITE_DB_PATH", "openlogbook.db"), help="Path to openlogbook.db")
    parser.add_argument("--dir", default="backups", help="Directory to store backups")
    parser.add_argument("--restore", help="Path to .enc backup file to restore")
    args = parser.parse_args()

    if args.restore:
        restore(args.restore, args.db)
    else:
        backup(args.db, args.dir)
