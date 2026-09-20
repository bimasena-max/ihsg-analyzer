# ml/_diag.py — kategorisasi kegagalan Yahoo, dipakai train.py & predict.py.
# Sama persis logikanya dengan yang ada di backtest_bei.py, supaya pesan
# error yang dilihat user konsisten di seluruh proyek, bukan format beda-beda
# di tiap skrip.
from collections import Counter


def classify(exc: Exception) -> str:
    msg = str(exc).lower()
    if "429" in msg or "too many requests" in msg or "rate limit" in msg:
        return "RATE_LIMIT (429) — Yahoo membatasi IP ini"
    if "999" in msg:
        return "BLOCKED (999) — Yahoo menolak IP/fingerprint ini"
    if "401" in msg or "403" in msg or "crumb" in msg or "cookie" in msg:
        return "AUTH — sesi/crumb Yahoo ditolak"
    if "timed out" in msg or "timeout" in msg:
        return "TIMEOUT"
    if any(k in msg for k in ("connection", "resolve", "dns", "refused", "unreachable")):
        return "NETWORK — tidak bisa terhubung sama sekali"
    return f"LAIN — {type(exc).__name__}: {str(exc)[:100]}"


def print_summary(counter: Counter):
    if not counter:
        return
    print("\nKENAPA GAGAL:")
    for reason, n in counter.most_common():
        print(f"  {n:>4}x  {reason}")
    top = counter.most_common(1)[0][0]
    if "RATE_LIMIT" in top or "BLOCKED" in top:
        print("-> Jalankan dari IP lain (GitHub Actions sudah dipakai untuk ini di ml-daily.yml).")
    elif "NETWORK" in top:
        print("-> Jaringan ini tidak bisa mencapai Yahoo sama sekali. VPN atau jalankan dari mesin lain.")
