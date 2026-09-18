#!/usr/bin/env python3
"""
scripts/diagnose-yahoo.py — cek dari layer mana Yahoo diblokir, sebelum
buang jam menjalankan backtest yang bakal gagal diam-diam.

  python scripts/diagnose-yahoo.py

Tiga layer dicek terpisah karena solusinya beda:
  1. DNS/koneksi mati total  -> masalah jaringan/ISP. VPN kadang cukup,
     kadang tidak (ISP yang blokir di level DNS/firewall butuh VPN;
     yang blokir di level lain mungkin tidak).
  2. Nyambung tapi Yahoo balas 429/999 -> itu Yahoo yang membatasi IP
     ini karena reputasi (sering kena di IP kantor/kampus/cloud yang
     dipakai banyak orang). Ganti IP (VPN, GitHub Actions, VPS) yang
     paling manjur — bukan cookie.
  3. Nyambung, tidak diblokir, tapi yfinance versi lama error -> upgrade
     yfinance, bukan masalah jaringan sama sekali.
"""
import socket
import sys
import time

HOST = "query1.finance.yahoo.com"


def cek_dns():
    try:
        ip = socket.gethostbyname(HOST)
        print(f"[1/3] DNS OK — {HOST} -> {ip}")
        return True
    except socket.gaierror as e:
        print(f"[1/3] DNS GAGAL — {e}")
        print("      -> Jaringan/ISP lu tidak bisa resolve domain Yahoo sama sekali.")
        print("      -> VPN kemungkinan besar akan menyelesaikan ini.")
        return False


def cek_koneksi():
    try:
        t0 = time.time()
        s = socket.create_connection((HOST, 443), timeout=8)
        s.close()
        print(f"[2/3] TCP 443 OK — {(time.time()-t0)*1000:.0f}ms")
        return True
    except OSError as e:
        print(f"[2/3] TCP 443 GAGAL — {e}")
        print("      -> Firewall jaringan lu memblokir koneksi ke Yahoo di level IP/port.")
        print("      -> VPN kemungkinan besar akan menyelesaikan ini.")
        return False


def cek_http():
    try:
        import urllib.request
        req = urllib.request.Request(
            f"https://{HOST}/v8/finance/chart/BBCA.JK?range=5d&interval=1d",
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        )
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read(200)
            print(f"[3/3] HTTP {r.status} OK — {(time.time()-t0)*1000:.0f}ms — {body[:60]}...")
            return True
    except urllib.error.HTTPError as e:
        print(f"[3/3] HTTP GAGAL — status {e.code}")
        if e.code == 429:
            print("      -> RATE LIMIT. Yahoo mengenali IP ini dan membatasinya.")
            print("      -> Cookie/crumb TIDAK akan menyelesaikan ini — itu soal reputasi IP.")
            print("      -> Solusi: kurangi kecepatan request, atau pindah IP (VPN/GitHub Actions/VPS).")
        elif e.code in (401, 403):
            print("      -> DITOLAK di level auth. Coba: pip install --upgrade yfinance")
        else:
            print(f"      -> HTTP {e.code} — cek pesan di atas.")
        return False
    except Exception as e:
        print(f"[3/3] GAGAL — {type(e).__name__}: {e}")
        return False


def main():
    print(f"Diagnosa akses ke {HOST}\n")
    dns_ok = cek_dns()
    if not dns_ok:
        simpulkan(dns=False, tcp=None, http=None)
        return
    tcp_ok = cek_koneksi()
    if not tcp_ok:
        simpulkan(dns=True, tcp=False, http=None)
        return
    http_ok = cek_http()
    simpulkan(dns=True, tcp=True, http=http_ok)


def simpulkan(dns, tcp, http):
    print("\n" + "=" * 60)
    if not dns or not tcp:
        print("KESIMPULAN: jaringan/ISP lu memblokir Yahoo di level koneksi.")
        print("Cookie tidak akan membantu — itu untuk auth, bukan konektivitas.")
        print("Coba VPN dulu. Kalau VPN pun tetap gagal di tes ini, jalankan")
        print("backtest dari mesin lain sepenuhnya (lihat panduan GitHub Actions).")
    elif http:
        print("KESIMPULAN: Yahoo BISA diakses dari sini sekarang.")
        print("Kalau backtest_bei.py tetap gagal, kemungkinan itu soal versi")
        print("yfinance, bukan blokir jaringan. Coba: pip install --upgrade yfinance")
    else:
        print("KESIMPULAN: nyambung ke Yahoo, tapi ditolak/dibatasi (lihat detail")
        print("di atas). Ini paling sering rate-limit berbasis reputasi IP, bukan")
        print("blokir permanen. Solusi paling pasti: jalankan dari IP lain.")
    print("=" * 60)


if __name__ == "__main__":
    main()
