# Post des faces cuites : halo + rayons diffus du soleil, étoiles rares, puis pré-compensation de l'ACES de three.js
# (l'image cuite est l'image voulue à l'écran ; on stocke la valeur linéaire que l'ACES ramènera dessus), export JPEG.
import sys, numpy as np
from PIL import Image
SRC, DST, SIZE = sys.argv[1], sys.argv[2], int(sys.argv[3])
Q = int(sys.argv[4]) if len(sys.argv) > 4 else 86
SUN_BAKE = np.array([-0.497, 0.5, -0.709]); SUN_BAKE /= np.linalg.norm(SUN_BAKE)   # lampe de la cuisson (ombres des nuages), 30° au-dessus de l'horizontale
# soleil visible (halo, rayons, disque) : plus bas, 12° à gauche et 12° au-dessus de l'horizontale, pour qu'il entre dans le cadre en haut à gauche
# avec l'horizon dans le bas de l'image (référence). L'écart de 18° entre les deux ne se lit pas sur les nuages vus d'orbite.
SUN = np.array([-0.2034, 0.2079, -0.9568]); SUN /= np.linalg.norm(SUN)   # 12° à gauche, 12° au-dessus : dans le coin haut-gauche du cadre en portrait, à son bord en paysage
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
    v = np.clip(y @ np.linalg.inv(M_OUT).T, 0, 0.97)      # après fit, avant M_OUT
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
    # planète (sous l'horizon, à ~35° sous l'horizontale : ALT 1400 km) : plus sombre et plus chaude — crème / doré / cuivré, pas de blanc craie
    pm = np.clip((-d[..., 1] - 0.52) / 0.08, 0, 1)[..., None]
    lin = lin * ((1 - pm) * np.array([1.0, 0.95, 0.85])[None, None] + pm * 0.80 * np.array([1.0, 0.90, 0.76])[None, None])
    # ambiance : la planète vire au doré côté soleil et au bleu-gris à l'opposé (lumière rasante), avant l'atmosphère
    elev = np.degrees(np.arcsin(np.clip(d[..., 1], -1, 1))); H = -34.95
    hz = d.copy(); hz[..., 1] = 0; hz /= np.maximum(np.linalg.norm(hz, axis=2, keepdims=True), 1e-6)
    sh = SUN.copy(); sh[1] = 0; sh /= np.linalg.norm(sh)
    cs = np.clip(hz @ sh, -1, 1)[..., None]                       # 1 face au soleil, -1 à l'opposé
    warm = np.clip(cs, 0, 1); cool = np.clip(-cs, 0, 1)
    tint = (1 - warm) * np.array([1.0, 1.0, 1.0]) + warm * np.array([1.08, 0.96, 0.78])
    tint = (1 - cool) * tint + cool * np.array([0.78, 0.86, 1.0])
    lin = lin * ((1 - pm) + pm * tint * (0.78 + 0.42 * warm - 0.18 * cool))
    # atmosphère (analytique, autour du limbe à -34.95°) : liseré brillant, lueur diffusée au-dessus de l'horizon,
    # voile bleuté sur la planète vue en rasant ; blanc doré vers le soleil, bleu à l'opposé
    fsun = (0.5 + 0.5 * warm)
    rimc_in = (1 - warm) * np.array([0.72, 0.84, 1.0]) + warm * np.array([1.0, 0.92, 0.78])
    rimc_out = (1 - warm) * np.array([0.40, 0.60, 1.0]) + warm * np.array([0.85, 0.72, 0.60])
    x = np.maximum(elev - H, 0)[..., None]                       # au-dessus du limbe (espace)
    rim = fsun * (0.9 * np.exp(-x / 0.35) * rimc_in + 0.40 * np.exp(-x / 1.6) * rimc_out + 0.09 * np.exp(-x / 5.0) * np.array([0.35, 0.55, 1.0]))
    rim = rim * np.clip((elev - H + 0.15) / 0.3, 0, 1)[..., None]   # pas sous le limbe
    y = np.maximum(H - elev, 0)[..., None]                       # sous le limbe (planète)
    haze = fsun * (0.45 * np.exp(-y / 3.5) + 0.08 * np.exp(-y / 14.0)) * pm
    hazec = (1 - warm) * np.array([0.62, 0.76, 1.0]) + warm * np.array([0.95, 0.88, 0.80])
    lin = lin * (1 - 0.55 * haze) + haze * hazec + rim
    # soleil : halo chaud large + rayons diffus
    cosang = np.clip(d @ SUN, -1, 1); ang = np.degrees(np.arccos(cosang))
    angb = np.degrees(np.arccos(np.clip(d @ SUN_BAKE, -1, 1)))
    lin[angb < 0.8] = 0.0                                  # on efface le disque cuit (le soleil visible est redessiné plus bas)
    core = np.clip((0.7 - ang) / 0.18, 0, 1)[..., None]   # disque visible : blanc doré, bord doux
    lin = lin * (1 - core) + core * np.array([1.0, 0.97, 0.90])[None, None]
    # azimut autour de l'axe du soleil
    e1 = np.cross(SUN, [0, 1, 0]); e1 /= np.linalg.norm(e1); e2 = np.cross(SUN, e1)
    phi = np.arctan2(d @ e2, d @ e1)
    halo = 2.2 * np.exp(-ang / 1.8) + 0.9 * np.exp(-ang / 6.5) + 0.14 * np.exp(-(ang / 13.0) ** 2) + 0.02 * np.exp(-(ang / 32.0) ** 2)
    ry = rays(phi) * (0.40 * np.exp(-ang / 18.0)) * np.clip((ang - 1.5) / 4.0, 0, 1)
    glow = (halo + ry)[..., None] * np.array([1.0, 0.82, 0.56])[None, None]
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
    # très hautes lumières (cœur du soleil) : vers le blanc, sans dérive de teinte dans l'inverse ACES ; plafond conservant la teinte
    m = lin.max(2, keepdims=True)
    sat = np.clip((m - 0.6) / 0.33, 0, 1) * 0.85
    lin = lin * (1 - sat) + lin.mean(2, keepdims=True) * sat
    lin = lin * np.minimum(1, 0.93 / np.maximum(m, 1e-6))
    # pré-compensation ACES (exposition 1) puis sRGB : valeur linéaire que l'ACES ramène sur l'image voulue,
    # plafonnée en conservant la teinte (planète ≤ 1.0 : sous le seuil du bloom ; espace ≤ 1.3 : le soleil fleurit un peu), stockée /2 (GAIN du shader)
    x = aces_inv(lin.reshape(-1, 3)).reshape(lin.shape)
    lim = 1.3 - 0.3 * pm
    x = x * np.minimum(1, lim / np.maximum(x.max(2, keepdims=True), 1e-6))
    out = lin2srgb(x / 2.0)
    # convention three.js (CubeTextureLoader : vues de l'intérieur, haut +Y ; ±Y : haut -Z/+Z) : nos faces GL (haut -Y) tournent de 180°
    img = Image.fromarray((out * 255 + .5).astype(np.uint8)).rotate(180)
    if img.width != SIZE: img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(f'{DST}/orbit_{f}.jpg', quality=Q, subsampling=0, optimize=True)
    print(f, 'ok')
