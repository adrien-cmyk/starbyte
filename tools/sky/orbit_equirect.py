# Panorama équirectangulaire unique à partir des six faces cuites (Cycles, repère GL : haut des faces latérales = -Y),
# puis post (halo + rayons du soleil, étoiles, atmosphère analytique, grade, pré-compensation ACES de three.js).
# Une seule image : aucune couture entre faces, un seul téléchargement, un seul décodage sur mobile.
# Usage : python3 orbit_equirect.py SRCDIR DST.jpg WIDTH [Q]      (hauteur = WIDTH / 2)
import sys, numpy as np
from PIL import Image
SRC, DST, WIDTH = sys.argv[1], sys.argv[2], int(sys.argv[3])
Q = int(sys.argv[4]) if len(sys.argv) > 4 else 88
HEIGHT = WIDTH // 2; BAND = 256
SUN_BAKE = np.array([-0.497, 0.5, -0.709], np.float32); SUN_BAKE /= np.linalg.norm(SUN_BAKE)   # lampe de la cuisson (ombres des nuages)
# soleil visible (halo, rayons, disque) : 12° à gauche, 12° au-dessus de l'horizontale — coin haut-gauche du cadre en portrait, bord en paysage
SUN = np.array([-0.2034, 0.2079, -0.9568], np.float32); SUN /= np.linalg.norm(SUN)
H_LIMB = -34.95   # élévation du limbe (ALT 1400 km)
FACE = { 'px': ((1, 0, 0), (0, -1, 0)), 'nx': ((-1, 0, 0), (0, -1, 0)), 'py': ((0, 1, 0), (0, 0, 1)), 'ny': ((0, -1, 0), (0, 0, -1)), 'pz': ((0, 0, 1), (0, -1, 0)), 'nz': ((0, 0, -1), (0, -1, 0)) }

def srgb2lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin2srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
M_IN = np.array([[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]])
M_OUT = np.array([[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]])
def aces_inv(y):
    v = np.clip(y @ np.linalg.inv(M_OUT).T, 0, 0.97)
    a = 1 - 0.983729 * v; b = 0.0245786 - 0.432951 * v; c = -0.000090537 - 0.238081 * v
    x = (-b + np.sqrt(np.maximum(b * b - 4 * a * c, 0))) / (2 * a)
    return np.clip(x @ np.linalg.inv(M_IN).T, 0, None) * 0.6

# faces cuites en linéaire (float32)
faces = {}
for f in FACE:
    im = np.asarray(Image.open(f'{SRC}/{f}.png').convert('RGB')).astype(np.float32) / 255.0
    faces[f] = srgb2lin(im).astype(np.float32)
N = next(iter(faces.values())).shape[0]
AX = { 'px': (0, 1), 'nx': (0, -1), 'py': (1, 1), 'ny': (1, -1), 'pz': (2, 1), 'nz': (2, -1) }

def sample_cube(d):
    """d (...,3) → couleur linéaire, bilinéaire dans la face dominante (repère de la cuisson)."""
    out = np.zeros(d.shape, np.float32)
    ad = np.abs(d); dom = ad.argmax(-1)
    for f, (axis, sign) in AX.items():
        m = (dom == axis) & ((d[..., axis] > 0) if sign > 0 else (d[..., axis] < 0))
        if not m.any(): continue
        look = np.array(FACE[f][0], np.float32); up = np.array(FACE[f][1], np.float32); right = np.cross(look, up)
        dd = d[m]; t = dd / (dd @ look)[:, None]
        x = ((t @ right) + 1) / 2 * N - 0.5; y = ((-(t @ up)) + 1) / 2 * N - 0.5
        x = np.clip(x, 0, N - 1.001); y = np.clip(y, 0, N - 1.001)
        x0 = x.astype(int); y0 = y.astype(int); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
        F = faces[f]
        c = (F[y0, x0] * (1 - fx) * (1 - fy) + F[y0, x0 + 1] * fx * (1 - fy) + F[y0 + 1, x0] * (1 - fx) * fy + F[y0 + 1, x0 + 1] * fx * fy)
        out[m] = c
    return out

rng = np.random.default_rng(7)
NST = 1500
u = rng.uniform(-1, 1, NST); t = rng.uniform(0, 2 * np.pi, NST); s = np.sqrt(1 - u * u)
STARS = np.stack([s * np.cos(t), u, s * np.sin(t)], 1)
SMAG = rng.uniform(0.15, 1.0, NST) ** 2.2; SMAG[rng.uniform(0, 1, NST) > 0.985] *= 2.2
STINT = np.where(rng.uniform(0, 1, NST)[:, None] > .8, np.array([[1.0, .86, .7]]), np.where(rng.uniform(0, 1, NST)[:, None] > .5, np.array([[.82, .9, 1.0]]), np.array([[1.0, 1.0, 1.0]])))
# position des étoiles dans le panorama
SU = (np.arctan2(STARS[:, 0], -STARS[:, 2]) / (2 * np.pi) + 0.5) * WIDTH
SV = (0.5 - np.arcsin(np.clip(STARS[:, 1], -1, 1)) / np.pi) * HEIGHT
PH = rng.uniform(0, 2 * np.pi, 9); FR = np.array([3, 5, 7, 11, 13, 17, 23, 29, 37])
def rays(phi):
    r = np.zeros_like(phi)
    for f, p, w in zip(FR, PH, [1, .8, .7, .55, .45, .35, .25, .2, .15]): r += w * np.sin(phi * f + p)
    r = r / 4.4; return np.clip(r - 0.15, 0, 1) ** 1.6
e1 = np.cross(SUN, [0, 1, 0]); e1 /= np.linalg.norm(e1); e2 = np.cross(SUN, e1)
sh = SUN.copy(); sh[1] = 0; sh /= np.linalg.norm(sh)

out = np.zeros((HEIGHT, WIDTH, 3), np.uint8)
for y0 in range(0, HEIGHT, BAND):
    y1 = min(HEIGHT, y0 + BAND)
    jj, ii = np.meshgrid((np.arange(WIDTH) + .5) / WIDTH, (np.arange(y0, y1) + .5) / HEIGHT)
    lon = (jj - 0.5) * 2 * np.pi; lat = (0.5 - ii) * np.pi            # colonne 0.5 = avant (-Z), ligne 0 = zénith (+Y)
    d = np.stack([np.sin(lon) * np.cos(lat), np.sin(lat), -np.cos(lon) * np.cos(lat)], -1).astype(np.float32)
    lin = sample_cube(d).astype(np.float64)
    # ---- planète : grade chaud, puis doré côté soleil / bleu-gris à l'opposé
    pm = np.clip((-d[..., 1] - 0.52) / 0.08, 0, 1)[..., None]
    lin = lin * ((1 - pm) * np.array([1.0, 0.95, 0.85]) + pm * 0.80 * np.array([1.0, 0.90, 0.76]))
    elev = np.degrees(lat)
    hz = d.copy(); hz[..., 1] = 0; hz /= np.maximum(np.linalg.norm(hz, axis=2, keepdims=True), 1e-6)
    cs = np.clip(hz @ sh, -1, 1)[..., None]
    warm = np.clip(cs, 0, 1); cool = np.clip(-cs, 0, 1)
    tint = (1 - warm) * np.array([1.0, 1.0, 1.0]) + warm * np.array([1.08, 0.96, 0.78])
    tint = (1 - cool) * tint + cool * np.array([0.78, 0.86, 1.0])
    lin = lin * ((1 - pm) + pm * tint * (0.78 + 0.42 * warm - 0.18 * cool))
    # ---- atmosphère analytique : liseré brillant (doré vers le soleil, bleu à l'opposé), lueur au-dessus de l'horizon, voile en rasant
    fsun = (0.5 + 0.5 * warm)
    rimc_in = (1 - warm) * np.array([0.72, 0.84, 1.0]) + warm * np.array([1.0, 0.92, 0.78])
    rimc_out = (1 - warm) * np.array([0.40, 0.60, 1.0]) + warm * np.array([0.85, 0.72, 0.60])
    x = np.maximum(elev - H_LIMB, 0)[..., None]
    rim = fsun * (0.9 * np.exp(-x / 0.35) * rimc_in + 0.40 * np.exp(-x / 1.6) * rimc_out + 0.09 * np.exp(-x / 5.0) * np.array([0.35, 0.55, 1.0]))
    rim = rim * np.clip((elev - H_LIMB + 0.15) / 0.3, 0, 1)[..., None]
    yb = np.maximum(H_LIMB - elev, 0)[..., None]
    haze = fsun * (0.45 * np.exp(-yb / 3.5) + 0.08 * np.exp(-yb / 14.0)) * pm
    hazec = (1 - warm) * np.array([0.62, 0.76, 1.0]) + warm * np.array([0.95, 0.88, 0.80])
    lin = lin * (1 - 0.55 * haze) + haze * hazec + rim
    # ---- soleil : on efface le disque cuit, on dessine le disque visible, halo chaud et rayons diffus
    ang = np.degrees(np.arccos(np.clip(d @ SUN, -1, 1)))
    angb = np.degrees(np.arccos(np.clip(d @ SUN_BAKE, -1, 1)))
    lin[angb < 0.8] = 0.0
    core = np.clip((0.7 - ang) / 0.18, 0, 1)[..., None]
    lin = lin * (1 - core) + core * np.array([1.0, 0.97, 0.90])
    phi = np.arctan2(d @ e2, d @ e1)
    halo = 2.2 * np.exp(-ang / 1.8) + 0.9 * np.exp(-ang / 6.5) + 0.14 * np.exp(-(ang / 13.0) ** 2) + 0.02 * np.exp(-(ang / 32.0) ** 2)
    ry = rays(phi) * (0.40 * np.exp(-ang / 18.0)) * np.clip((ang - 1.5) / 4.0, 0, 1)
    lin = lin + (halo + ry)[..., None] * np.array([1.0, 0.82, 0.56])
    # ---- étoiles : seulement sur le noir
    black = (lin.sum(2) < 0.015)
    for k in np.nonzero((SV >= y0 - 3) & (SV < y1 + 3))[0]:
        px, py = SU[k], SV[k] - y0
        xc, yc = int(px) % WIDTH, int(py)
        if not (0 <= yc < y1 - y0) or not black[yc, xc]: continue
        r = 2
        ys, xs = np.mgrid[max(0, yc - r):min(y1 - y0, yc + r + 1), xc - r:xc + r + 1]
        g = np.exp(-(((xs + .5 - px) ** 2 + (ys + .5 - py) ** 2) / (2 * (0.55 if SMAG[k] < .5 else 0.75) ** 2)))
        lin[ys, xs % WIDTH] += (g * SMAG[k] * 0.55)[..., None] * STINT[k]
    # ---- hautes lumières vers le blanc, plafond conservant la teinte, pré-compensation ACES, stockage /2
    m = lin.max(2, keepdims=True)
    sat = np.clip((m - 0.6) / 0.33, 0, 1) * 0.85
    lin = lin * (1 - sat) + lin.mean(2, keepdims=True) * sat
    lin = lin * np.minimum(1, 0.93 / np.maximum(m, 1e-6))
    xx = aces_inv(lin.reshape(-1, 3)).reshape(lin.shape)
    lim = 1.3 - 0.3 * pm
    xx = xx * np.minimum(1, lim / np.maximum(xx.max(2, keepdims=True), 1e-6))
    out[y0:y1] = (lin2srgb(xx / 2.0) * 255 + .5).astype(np.uint8)
    print(f'{y1}/{HEIGHT}', flush=True)
Image.fromarray(out).save(DST, quality=Q, subsampling=0, optimize=True, progressive=False)
print('ok', DST)
