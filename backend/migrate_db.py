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

print("All columns:", [c[1] for c in cur.execute('PRAGMA table_info(transactions)').fetchall()])
conn.close()
