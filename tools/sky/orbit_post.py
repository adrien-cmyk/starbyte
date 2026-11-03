# Post des faces cuites : halo + rayons diffus du soleil, étoiles rares, puis pré-compensation de l'ACES de three.js
# (l'image cuite est l'image voulue à l'écran ; on stocke la valeur linéaire que l'ACES ramènera dessus), export JPEG.
import sys, numpy as np
from PIL import Image
SRC, DST, SIZE = sys.argv[1], sys.argv[2], int(sys.argv[3])
Q = int(sys.argv[4]) if len(sys.argv) > 4 else 86
SUN = np.array([-0.497, 0.5, -0.709]); SUN /= np.linalg.norm(SUN)
FACE = { 'px': ((1, 0, 0), (0, -1, 0)), 'nx': ((-1, 0, 0), (0, -1, 0)), 'py': ((0, 1, 0), (0, 0, 1)), 'ny': ((0, -1, 0), (0, 0, -1)), 'pz': ((0, 0, 1), (0, -1, 0)), 'nz': ((0, 0, -1), (0, -1, 0)) }
rng = np.random.default_rng(7)
# étoiles : directions aléatoires, éclat varié
NST = 1500
u = rng.uniform(-1, 1, NST); t = rng.uniform(0, 2 * np.pi, NST); s = np.sqrt(1 - u * u)
STARS = np.stack([s * np.cos(t), u, s * np.sin(t)], 1)
SMAG = rng.uniform(0.15, 1.0, NST) ** 2.2; SMAG[rng.uniform(0, 1, NST) > 0.985] *= 2.2
STINT = np.where(rng.uniform(0, 1, NST)[:, None] > .8, np.array([[1.0, .86, .7]]), np.where(rng.uniform(0, 1, NST)[:, None] > .5, np.array([[.82, .9, 1.0]]), np.array([[1.0, 1.0, 1.0]])))
# rayons : fonction angulaire périodique (somme de sinus à phases aléatoires)
PH = rng.uniform(0, 2 * np.pi, 9); FR = np.array([3, 5, 7, 11, 13, 17, 23, 29, 37])
def rays(phi):
    r = np.zeros_like(phi)
    for f, p, w in zip(FR, PH, [1, .8, .7, .55, .45, .35, .25, .2, .15]): r += w * np.sin(phi * f + p)
    r = r / 4.4; return np.clip(r - 0.15, 0, 1) ** 1.6

def srgb2lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin2srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)
M_IN = np.array([[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]])
M_OUT = np.array([[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]])
def aces_inv(y, exposure=1.0):
    v = np.clip(y @ np.linalg.inv(M_OUT).T, 0, 0.985)      # après fit, avant M_OUT
    a = 1 - 0.983729 * v; b = 0.0245786 - 0.432951 * v; c = -0.000090537 - 0.238081 * v
    x = (-b + np.sqrt(np.maximum(b * b - 4 * a * c, 0))) / (2 * a)
    return np.clip(x @ np.linalg.inv(M_IN).T, 0, None) * 0.6 / exposure

for f, (look, up) in FACE.items():
    im = np.asarray(Image.open(f'{SRC}/{f}.png').convert('RGB')).astype(np.float64) / 255.0
    n = im.shape[0]
    look, up = np.array(look, float), np.array(up, float); right = np.cross(look, up)
    j, i = np.meshgrid((np.arange(n) + .5) / n * 2 - 1, (np.arange(n) + .5) / n * 2 - 1)   # i = ligne (haut→bas), j = colonne
    d = look[None, None] + right[None, None] * j[..., None] - up[None, None] * i[..., None]   # ligne 0 = haut de l'image = +up
    d /= np.linalg.norm(d, axis=2, keepdims=True)
    lin = srgb2lin(im)
    # soleil : halo chaud large + rayons diffus
    cosang = np.clip(d @ SUN, -1, 1); ang = np.degrees(np.arccos(cosang))
    # azimut autour de l'axe du soleil
    e1 = np.cross(SUN, [0, 1, 0]); e1 /= np.linalg.norm(e1); e2 = np.cross(SUN, e1)
    phi = np.arctan2(d @ e2, d @ e1)
    halo = 1.4 * np.exp(-ang / 1.6) + 0.5 * np.exp(-ang / 5.0) + 0.10 * np.exp(-(ang / 16.0) ** 2) + 0.03 * np.exp(-(ang / 30.0) ** 2)
    ry = rays(phi) * (0.30 * np.exp(-ang / 16.0)) * np.clip((ang - 1.5) / 4.0, 0, 1)
    glow = (halo + ry)[..., None] * np.array([1.0, 0.84, 0.62])[None, None]
    # le voile atténue derrière la planète ? non : le halo est dans l'optique, il se superpose à tout
    lin = lin + glow
    # étoiles : seulement sur le noir
    black = (lin.sum(2) < 0.015)
    for k in range(NST):
        sd = STARS[k]
        if sd @ look <= 0.35: continue
        # projection sur la face
        tproj = sd / (sd @ look); px = (tproj @ right + 1) / 2 * n; py = (-(tproj @ up) + 1) / 2 * n
        if not (0 <= px < n and 0 <= py < n): continue
        x0, y0 = int(px), int(py)
        if not black[y0, x0]: continue
        r = 2
        ys, xs = np.mgrid[max(0, y0 - r):min(n, y0 + r + 1), max(0, x0 - r):min(n, x0 + r + 1)]
        g = np.exp(-(((xs + .5 - px) ** 2 + (ys + .5 - py) ** 2) / (2 * (0.55 if SMAG[k] < .5 else 0.75) ** 2)))
        lin[ys, xs] += (g * SMAG[k] * 0.55)[..., None] * STINT[k][None, None]
    lin = np.clip(lin, 0, 1)
    # pré-compensation ACES (exposition 1) puis sRGB
    # valeur linéaire que l'ACES ramène sur l'image voulue, plafonnée (bloom) et stockée /2 (le shader remultiplie : GAIN)
    out = lin2srgb(np.clip(aces_inv(lin.reshape(-1, 3)).reshape(lin.shape), 0, 1.15) / 2.0)
    # convention three.js (CubeTextureLoader : vues de l'intérieur, haut +Y ; ±Y : haut -Z/+Z) : nos faces GL (haut -Y) tournent de 180°
    img = Image.fromarray((out * 255 + .5).astype(np.uint8)).rotate(180)
    if img.width != SIZE: img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(f'{DST}/orbit_{f}.jpg', quality=Q, subsampling=0, optimize=True)
    print(f, 'ok')
