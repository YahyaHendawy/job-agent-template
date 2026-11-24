"""Generates simple PNG app icons (blue tile with a white briefcase) using only the standard library."""
import struct, zlib, sys, os

def png(size, pad_frac):
    bg = (36, 87, 245); fg = (255, 255, 255)
    rows = []
    s = size
    pad = int(s * pad_frac)
    def inside_round(x, y, x0, y0, x1, y1, r):
        if x < x0 or x > x1 or y < y0 or y > y1: return False
        cx = min(max(x, x0 + r), x1 - r); cy = min(max(y, y0 + r), y1 - r)
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    # briefcase geometry relative to the safe area
    a0, a1 = pad, s - pad
    w = a1 - a0
    bx0, bx1 = a0 + int(w * .18), a1 - int(w * .18)
    by0, by1 = a0 + int(w * .34), a1 - int(w * .20)
    hx0, hx1 = a0 + int(w * .37), a1 - int(w * .37)
    hy0, hy1 = a0 + int(w * .22), by0 + 2
    ht = max(2, int(w * .05))
    for y in range(s):
        row = bytearray([0])
        for x in range(s):
            c = bg
            body = inside_round(x, y, bx0, by0, bx1, by1, int(w * .07))
            handle = inside_round(x, y, hx0, hy0, hx1, hy1, int(w * .05)) and not inside_round(x, y, hx0 + ht, hy0 + ht, hx1 - ht, hy1 + ht, int(w * .03))
            seam = body and abs(y - (by0 + (by1 - by0) * 0.42)) < max(1, w * .018)
            if (body or handle) and not seam: c = fg
            row += bytes(c)
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", s, s, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")

out = sys.argv[1]
for name, size, pad in [("apple-touch-icon.png", 180, .10), ("icon-192.png", 192, .10), ("icon-512.png", 512, .10), ("icon-512-maskable.png", 512, .20)]:
    with open(os.path.join(out, name), "wb") as f: f.write(png(size, pad))
print("icons written")
