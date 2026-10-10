import sqlite3

conn = sqlite3.connect('assay.db')
cur = conn.cursor()
cols = [c[1] for c in cur.execute('PRAGMA table_info(transactions)').fetchall()]
if 'payment_method' not in cols:
    cur.execute("ALTER TABLE transactions ADD COLUMN payment_method VARCHAR DEFAULT 'UPI'")
    conn.commit()
    print("Added payment_method column to transactions.")
else:
    print("payment_method column already exists.")

print("All columns transactions:", [c[1] for c in cur.execute('PRAGMA table_info(transactions)').fetchall()])

acc_cols = [c[1] for c in cur.execute('PRAGMA table_info(accounts)').fetchall()]
if 'bank_key' not in acc_cols:
    cur.execute("ALTER TABLE accounts ADD COLUMN bank_key VARCHAR DEFAULT NULL")
    conn.commit()
    print("Added bank_key column to accounts.")
if 'last_synced_at' not in acc_cols:
    cur.execute("ALTER TABLE accounts ADD COLUMN last_synced_at VARCHAR DEFAULT NULL")
    conn.commit()
    print("Added last_synced_at column to accounts.")

print("All columns accounts:", [c[1] for c in cur.execute('PRAGMA table_info(accounts)').fetchall()])
conn.close()
