# Fond orbital Starbyte : cubemap (repère three.js : Y haut) rendu en Cycles — planète immense couverte de nuages, soleil chaud haut-gauche.
import bpy, sys, math
from mathutils import Vector, Matrix
SIZE = int(sys.argv[sys.argv.index('--')+1]); FACES = sys.argv[sys.argv.index('--')+2].split(','); OUT = sys.argv[sys.argv.index('--')+3]
SAMPLES = int(sys.argv[sys.argv.index('--')+4]) if len(sys.argv) > sys.argv.index('--')+4 else 32
R = 6371.0; ALT = 1400.0   # orbite plus haute que l'ISS : l'horizon plonge de 35°, la courbure se lit dans l'image (référence)
SUN = Vector((-0.497, 0.5, -0.709)).normalized()   # canonique : 35° à gauche de -Z, 30° au-dessus de l'horizontale

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.max_bounces = 4; sc.cycles.transparent_max_bounces = 8
sc.render.resolution_x = sc.render.resolution_y = SIZE; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'
sc.view_settings.view_transform = 'Filmic'; sc.view_settings.look = 'Medium High Contrast'; sc.view_settings.exposure = 0.2
sc.render.film_transparent = False
# monde : noir profond
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0, 0, 0, 1)

def sphere(name, r, center, segs=256):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=r, location=center)
    o = bpy.context.object; o.name = name
    for p in o.data.polygons: p.use_smooth = True
    return o

C = Vector((0, -(R + ALT), 0))
planet = sphere('planet', R, C)
clouds = sphere('clouds', R * 1.0035, C)
atmo = sphere('atmo', R * 1.0060, C, 192)

def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); return m, nt, nt.nodes, nt.links

# ---- océan + continents
m, nt, N, L = mat('M_planet')
out = N.new('ShaderNodeOutputMaterial'); bsdf = N.new('ShaderNodeBsdfPrincipled')
tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / R, 1 / R, 1 / R)
L.new(tc.outputs['Object'], mp.inputs['Vector'])
land = N.new('ShaderNodeTexNoise'); land.noise_dimensions = '3D'; land.inputs['Scale'].default_value = 1.6; land.inputs['Detail'].default_value = 9; land.inputs['Roughness'].default_value = .55; land.inputs['Distortion'].default_value = .6
L.new(mp.outputs['Vector'], land.inputs['Vector'])
rl = N.new('ShaderNodeValToRGB'); rl.color_ramp.elements[0].position = .56; rl.color_ramp.elements[1].position = .60
L.new(land.outputs['Fac'], rl.inputs['Fac'])
ocean = (0.008, 0.03, 0.085, 1); soil = (0.16, 0.12, 0.07, 1)
mixc = N.new('ShaderNodeMixRGB'); mixc.inputs[1].default_value = ocean; mixc.inputs[2].default_value = soil
L.new(rl.outputs['Color'], mixc.inputs['Fac']); L.new(mixc.outputs['Color'], bsdf.inputs['Base Color'])
rough = N.new('ShaderNodeMixRGB'); rough.inputs[1].default_value = (0.75,) * 3 + (1,); rough.inputs[2].default_value = (0.9,) * 3 + (1,)
L.new(rl.outputs['Color'], rough.inputs['Fac']); L.new(rough.outputs['Color'], bsdf.inputs['Roughness'])
bsdf.inputs['Specular IOR Level'].default_value = 0.12
L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
planet.data.materials.append(m)

# ---- nuages : nappes + cellules, relief par bump, alpha
m, nt, N, L = mat('M_clouds'); m.blend_method = 'HASHED'
out = N.new('ShaderNodeOutputMaterial'); bsdf = N.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Base Color'].default_value = (0.93, 0.90, 0.85, 1); bsdf.inputs['Roughness'].default_value = 0.98
bsdf.inputs['Subsurface Weight'].default_value = 0.0
tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / R, 1 / R, 1 / R)
L.new(tc.outputs['Object'], mp.inputs['Vector'])
# cyclones : rotation du domaine autour de deux centres (angle décroissant avec la distance) -> vraies spirales
def vortex(src, center, sigma, amp):
    c = Vector(center).normalized()
    dist = N.new('ShaderNodeVectorMath'); dist.operation = 'DISTANCE'; dist.inputs[1].default_value = c
    L.new(src, dist.inputs[0])
    q = N.new('ShaderNodeMath'); q.operation = 'DIVIDE'; q.inputs[1].default_value = sigma; L.new(dist.outputs['Value'], q.inputs[0])
    q2 = N.new('ShaderNodeMath'); q2.operation = 'POWER'; q2.inputs[1].default_value = 2.0; L.new(q.outputs['Value'], q2.inputs[0])
    ng = N.new('ShaderNodeMath'); ng.operation = 'MULTIPLY'; ng.inputs[1].default_value = -1.0; L.new(q2.outputs['Value'], ng.inputs[0])
    ex = N.new('ShaderNodeMath'); ex.operation = 'EXPONENT'; L.new(ng.outputs['Value'], ex.inputs[0])
    an = N.new('ShaderNodeMath'); an.operation = 'MULTIPLY'; an.inputs[1].default_value = amp; L.new(ex.outputs['Value'], an.inputs[0])
    rot = N.new('ShaderNodeVectorRotate'); rot.rotation_type = 'AXIS_ANGLE'; rot.inputs['Center'].default_value = c; rot.inputs['Axis'].default_value = c
    L.new(src, rot.inputs['Vector']); L.new(an.outputs['Value'], rot.inputs['Angle'])
    return rot.outputs['Vector']
# centres dans la calotte visible (nadir = +Y en repère objet ; l'avant de la vue est -Z, le soleil vers -X)
v1 = vortex(mp.outputs['Vector'], (-0.25, 1.0, -0.75), 0.13, 2.4)    # grand cyclone, avant-gauche (sous la vue, vers l'horizon)
v2 = vortex(v1, (0.45, 1.0, -0.55), 0.065, 1.3)                       # petit, à droite
# déformation du domaine : fronts (pas de 'distortion' du bruit, qui strie)
wn = N.new('ShaderNodeTexNoise'); wn.inputs['Scale'].default_value = 1.2; wn.inputs['Detail'].default_value = 3; wn.inputs['Roughness'].default_value = .5
L.new(v2, wn.inputs['Vector'])
wsub = N.new('ShaderNodeVectorMath'); wsub.operation = 'SUBTRACT'; wsub.inputs[1].default_value = (.5, .5, .5)
L.new(wn.outputs['Color'], wsub.inputs[0])
wsc = N.new('ShaderNodeVectorMath'); wsc.operation = 'SCALE'; wsc.inputs['Scale'].default_value = .40
L.new(wsub.outputs['Vector'], wsc.inputs[0])
warp = N.new('ShaderNodeVectorMath'); warp.operation = 'ADD'
L.new(v2, warp.inputs[0]); L.new(wsc.outputs['Vector'], warp.inputs[1])
# météo : quelles régions sont couvertes (nappes), parsemées (cumulus) ou dégagées
wx = N.new('ShaderNodeTexNoise'); wx.inputs['Scale'].default_value = 0.8; wx.inputs['Detail'].default_value = 3; wx.inputs['Roughness'].default_value = .5
L.new(warp.outputs['Vector'], wx.inputs['Vector'])
# nappes stratiformes : bruit détaillé, bord défini
cl = N.new('ShaderNodeTexNoise'); cl.inputs['Scale'].default_value = 2.6; cl.inputs['Detail'].default_value = 14; cl.inputs['Roughness'].default_value = .56; cl.inputs['Lacunarity'].default_value = 2.1
L.new(warp.outputs['Vector'], cl.inputs['Vector'])
sh = N.new('ShaderNodeMath'); sh.operation = 'MULTIPLY_ADD'; sh.inputs[1].default_value = .30; sh.inputs[2].default_value = -.15   # + (wx-.5)*.3
L.new(wx.outputs['Fac'], sh.inputs[0])
shs = N.new('ShaderNodeMath'); shs.operation = 'ADD'; L.new(cl.outputs['Fac'], shs.inputs[0]); L.new(sh.outputs['Value'], shs.inputs[1])
sheet = N.new('ShaderNodeMapRange'); sheet.inputs['From Min'].default_value = .45; sheet.inputs['From Max'].default_value = .565
L.new(shs.outputs['Value'], sheet.inputs['Value'])
# cumulus : cellules Voronoi, en champs
vo = N.new('ShaderNodeTexNoise'); vo.inputs['Scale'].default_value = 22; vo.inputs['Detail'].default_value = 7; vo.inputs['Roughness'].default_value = .62; vo.inputs['Lacunarity'].default_value = 2.2
L.new(warp.outputs['Vector'], vo.inputs['Vector'])
puff = N.new('ShaderNodeMapRange'); puff.inputs['From Min'].default_value = .50; puff.inputs['From Max'].default_value = .66
L.new(vo.outputs['Fac'], puff.inputs['Value'])
fld = N.new('ShaderNodeTexNoise'); fld.inputs['Scale'].default_value = 4.5; fld.inputs['Detail'].default_value = 4; fld.inputs['Roughness'].default_value = .5
L.new(warp.outputs['Vector'], fld.inputs['Vector'])
fmask = N.new('ShaderNodeMapRange'); fmask.inputs['From Min'].default_value = .40; fmask.inputs['From Max'].default_value = .54
L.new(fld.outputs['Fac'], fmask.inputs['Value'])
pf = N.new('ShaderNodeMath'); pf.operation = 'MULTIPLY'; L.new(puff.outputs['Result'], pf.inputs[0]); L.new(fmask.outputs['Result'], pf.inputs[1])
pf2 = N.new('ShaderNodeMath'); pf2.operation = 'MULTIPLY'; pf2.inputs[1].default_value = .9; L.new(pf.outputs['Value'], pf2.inputs[0])
# grain fin : texture interne des nappes
fine = N.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 14; fine.inputs['Detail'].default_value = 8; fine.inputs['Roughness'].default_value = .6
L.new(warp.outputs['Vector'], fine.inputs['Vector'])
am = N.new('ShaderNodeMath'); am.operation = 'MULTIPLY_ADD'; am.inputs[1].default_value = .4; am.inputs[2].default_value = .65
L.new(fine.outputs['Fac'], am.inputs[0])
shm = N.new('ShaderNodeMath'); shm.operation = 'MULTIPLY'; L.new(sheet.outputs['Result'], shm.inputs[0]); L.new(am.outputs['Value'], shm.inputs[1])
dens = N.new('ShaderNodeMath'); dens.operation = 'MAXIMUM'; L.new(shm.outputs['Value'], dens.inputs[0]); L.new(pf2.outputs['Value'], dens.inputs[1])
L.new(dens.outputs['Value'], bsdf.inputs['Alpha'])
# relief : hauteur = nappes (bruit brut, formes amples) + cumulus (bosses) + grain
bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 1.0; bump.inputs['Distance'].default_value = 45.0
h1 = N.new('ShaderNodeMath'); h1.operation = 'MULTIPLY_ADD'; h1.inputs[1].default_value = 1.0
L.new(cl.outputs['Fac'], h1.inputs[0]); L.new(sheet.outputs['Result'], h1.inputs[2])
h2 = N.new('ShaderNodeMath'); h2.operation = 'MULTIPLY_ADD'; h2.inputs[1].default_value = .8
L.new(pf.outputs['Value'], h2.inputs[0]); L.new(h1.outputs['Value'], h2.inputs[2])
h3 = N.new('ShaderNodeMath'); h3.operation = 'MULTIPLY_ADD'; h3.inputs[1].default_value = .08
L.new(fine.outputs['Fac'], h3.inputs[0]); L.new(h2.outputs['Value'], h3.inputs[2])
L.new(h3.outputs['Value'], bump.inputs['Height']); L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
clouds.data.materials.append(m)

# ---- atmosphère : liseré bleu fin au limbe + voile léger côté jour
m, nt, N, L = mat('M_atmo'); m.blend_method = 'BLEND'
out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent'); em = N.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (0.45, 0.65, 1.0, 1); em.inputs['Strength'].default_value = 4.5
lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.08
geo = N.new('ShaderNodeNewGeometry'); dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = SUN
L.new(geo.outputs['Normal'], dot.inputs[0])
day = N.new('ShaderNodeMath'); day.operation = 'MULTIPLY_ADD'; day.inputs[1].default_value = .9; day.inputs[2].default_value = .25
L.new(dot.outputs['Value'], day.inputs[0])
dayc = N.new('ShaderNodeClamp'); L.new(day.outputs['Value'], dayc.inputs['Value'])
pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 7.0
L.new(lw.outputs['Facing'], pw.inputs[0])
haze = N.new('ShaderNodeMath'); haze.operation = 'MULTIPLY_ADD'; haze.inputs[1].default_value = 1.0; haze.inputs[2].default_value = 0.015
L.new(pw.outputs['Value'], haze.inputs[0])
fac = N.new('ShaderNodeMath'); fac.operation = 'MULTIPLY'; L.new(haze.outputs['Value'], fac.inputs[0]); L.new(dayc.outputs['Result'], fac.inputs[1])
L.new(fac.outputs['Value'], mix.inputs['Fac']); L.new(tr.outputs['BSDF'], mix.inputs[1]); L.new(em.outputs['Emission'], mix.inputs[2])
L.new(mix.outputs['Shader'], out.inputs['Surface'])
atmo.data.materials.append(m); atmo.visible_shadow = False; atmo.visible_diffuse = False; atmo.visible_glossy = False

# ---- soleil
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.object
sun.data.energy = 5.5; sun.data.color = (1.0, 0.74, 0.50); sun.data.angle = math.radians(0.53)
sun.rotation_mode = 'QUATERNION'; sun.rotation_quaternion = (-SUN).to_track_quat('-Z', 'Y')   # la lampe éclaire selon son -Z
# disque visible
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=120.0, location=SUN * 20000)
disc = bpy.context.object; md = bpy.data.materials.new('M_sun'); md.use_nodes = True
e = md.node_tree.nodes['Principled BSDF']; e.inputs['Emission Color'].default_value = (1, .97, .92, 1); e.inputs['Emission Strength'].default_value = 60
disc.data.materials.append(md)

# ---- caméra : 6 faces (convention cubemap GL)
cam_data = bpy.data.cameras.new('C'); cam_data.lens_unit = 'FOV'; cam_data.angle = math.radians(90); cam_data.sensor_fit = 'AUTO'; cam_data.clip_end = 100000
cam = bpy.data.objects.new('C', cam_data); sc.collection.objects.link(cam); sc.camera = cam
FACE = { 'px': ((1, 0, 0), (0, -1, 0)), 'nx': ((-1, 0, 0), (0, -1, 0)), 'py': ((0, 1, 0), (0, 0, 1)), 'ny': ((0, -1, 0), (0, 0, -1)), 'pz': ((0, 0, 1), (0, -1, 0)), 'nz': ((0, 0, -1), (0, -1, 0)) }
for f in FACES:
    if f == 'view':
        sc.render.resolution_x = SIZE * 2; sc.render.resolution_y = SIZE * 2 * 9 // 16; cam_data.angle = math.radians(75); cam_data.sensor_fit = 'HORIZONTAL'
        Lk = Vector((0, -math.sin(math.radians(32)), -math.cos(math.radians(32)))); U = Vector((0, 1, 0)); U = (U - Lk * U.dot(Lk)).normalized()
    else: Lk, U = Vector(FACE[f][0]), Vector(FACE[f][1])
    right = Lk.cross(U)
    M = Matrix(); M.identity()
    for i, v in enumerate((right, U, -Lk)):
        M[0][i], M[1][i], M[2][i] = v.x, v.y, v.z
    cam.matrix_world = M.to_4x4()
    sc.render.filepath = f'{OUT}/{f}.png'
    bpy.ops.render.render(write_still=True)
    print('face', f, 'ok')
