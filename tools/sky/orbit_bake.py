# Fond orbital Starbyte : cubemap (repère three.js : Y haut) rendu en Cycles — planète immense couverte de nuages, soleil chaud haut-gauche.
import bpy, sys, math
from mathutils import Vector, Matrix
SIZE = int(sys.argv[sys.argv.index('--')+1]); FACES = sys.argv[sys.argv.index('--')+2].split(','); OUT = sys.argv[sys.argv.index('--')+3]
SAMPLES = int(sys.argv[sys.argv.index('--')+4]) if len(sys.argv) > sys.argv.index('--')+4 else 32
R = 6371.0; ALT = 300.0
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
atmo = sphere('atmo', R * 1.007, C, 192)

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
ocean = (0.015, 0.055, 0.14, 1); soil = (0.16, 0.12, 0.07, 1)
mixc = N.new('ShaderNodeMixRGB'); mixc.inputs[1].default_value = ocean; mixc.inputs[2].default_value = soil
L.new(rl.outputs['Color'], mixc.inputs['Fac']); L.new(mixc.outputs['Color'], bsdf.inputs['Base Color'])
rough = N.new('ShaderNodeMixRGB'); rough.inputs[1].default_value = (0.55,) * 3 + (1,); rough.inputs[2].default_value = (0.9,) * 3 + (1,)
L.new(rl.outputs['Color'], rough.inputs['Fac']); L.new(rough.outputs['Color'], bsdf.inputs['Roughness'])
bsdf.inputs['Specular IOR Level'].default_value = 0.35
L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
planet.data.materials.append(m)

# ---- nuages : nappes + cellules, relief par bump, alpha
m, nt, N, L = mat('M_clouds'); m.blend_method = 'HASHED'
out = N.new('ShaderNodeOutputMaterial'); bsdf = N.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Base Color'].default_value = (0.93, 0.90, 0.85, 1); bsdf.inputs['Roughness'].default_value = 0.98
bsdf.inputs['Subsurface Weight'].default_value = 0.0
tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / R, 1 / R, 1 / R)
L.new(tc.outputs['Object'], mp.inputs['Vector'])
# déformation du domaine : tourbillons et fronts (pas de 'distortion' du bruit, qui strie)
wn = N.new('ShaderNodeTexNoise'); wn.inputs['Scale'].default_value = 1.6; wn.inputs['Detail'].default_value = 3; wn.inputs['Roughness'].default_value = .5
L.new(mp.outputs['Vector'], wn.inputs['Vector'])
wsub = N.new('ShaderNodeVectorMath'); wsub.operation = 'SUBTRACT'; wsub.inputs[1].default_value = (.5, .5, .5)
L.new(wn.outputs['Color'], wsub.inputs[0])
wsc = N.new('ShaderNodeVectorMath'); wsc.operation = 'SCALE'; wsc.inputs['Scale'].default_value = .45
L.new(wsub.outputs['Vector'], wsc.inputs[0])
warp = N.new('ShaderNodeVectorMath'); warp.operation = 'ADD'
L.new(mp.outputs['Vector'], warp.inputs[0]); L.new(wsc.outputs['Vector'], warp.inputs[1])
# second étage de tourbillons plus fins
wn2 = N.new('ShaderNodeTexNoise'); wn2.inputs['Scale'].default_value = 5.0; wn2.inputs['Detail'].default_value = 2; wn2.inputs['Roughness'].default_value = .5
L.new(warp.outputs['Vector'], wn2.inputs['Vector'])
wsub2 = N.new('ShaderNodeVectorMath'); wsub2.operation = 'SUBTRACT'; wsub2.inputs[1].default_value = (.5, .5, .5)
L.new(wn2.outputs['Color'], wsub2.inputs[0])
wsc2 = N.new('ShaderNodeVectorMath'); wsc2.operation = 'SCALE'; wsc2.inputs['Scale'].default_value = .10
L.new(wsub2.outputs['Vector'], wsc2.inputs[0])
warp2 = N.new('ShaderNodeVectorMath'); warp2.operation = 'ADD'
L.new(warp.outputs['Vector'], warp2.inputs[0]); L.new(wsc2.outputs['Vector'], warp2.inputs[1])
# météo (grandes zones claires / couvertes)
wx = N.new('ShaderNodeTexNoise'); wx.inputs['Scale'].default_value = 1.3; wx.inputs['Detail'].default_value = 5; wx.inputs['Roughness'].default_value = .55
L.new(warp.outputs['Vector'], wx.inputs['Vector'])
# nappes fines
cl = N.new('ShaderNodeTexNoise'); cl.inputs['Scale'].default_value = 5.5; cl.inputs['Detail'].default_value = 16; cl.inputs['Roughness'].default_value = .58; cl.inputs['Lacunarity'].default_value = 2.1
L.new(warp2.outputs['Vector'], cl.inputs['Vector'])
# cellules (cumulus)
vo = N.new('ShaderNodeTexVoronoi'); vo.feature = 'SMOOTH_F1'; vo.inputs['Scale'].default_value = 36; vo.inputs['Smoothness'].default_value = .7; vo.inputs['Randomness'].default_value = 1.0
L.new(warp2.outputs['Vector'], vo.inputs['Vector'])
inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
L.new(vo.outputs['Distance'], inv.inputs[1])
m1 = N.new('ShaderNodeMath'); m1.operation = 'MULTIPLY_ADD'; m1.inputs[1].default_value = .30; m1.inputs[2].default_value = .78
L.new(inv.outputs['Value'], m1.inputs[0])
m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'
L.new(cl.outputs['Fac'], m2.inputs[0]); L.new(m1.outputs['Value'], m2.inputs[1])
m3 = N.new('ShaderNodeMath'); m3.operation = 'MULTIPLY_ADD'; m3.inputs[1].default_value = .70
L.new(wx.outputs['Fac'], m3.inputs[0]); L.new(m2.outputs['Value'], m3.inputs[2])   # wx*.7 + nappes
# grain fin (texture interne des nappes)
fine = N.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 24; fine.inputs['Detail'].default_value = 10; fine.inputs['Roughness'].default_value = .62
L.new(warp2.outputs['Vector'], fine.inputs['Vector'])
m4 = N.new('ShaderNodeMath'); m4.operation = 'MULTIPLY_ADD'; m4.inputs[1].default_value = .16; m4.inputs[2].default_value = -.08
L.new(fine.outputs['Fac'], m4.inputs[0])
m5 = N.new('ShaderNodeMath'); m5.operation = 'ADD'; L.new(m3.outputs['Value'], m5.inputs[0]); L.new(m4.outputs['Value'], m5.inputs[1])
dens = N.new('ShaderNodeValToRGB'); dens.color_ramp.elements[0].position = .60; dens.color_ramp.elements[1].position = .98
L.new(m5.outputs['Value'], dens.inputs['Fac'])
L.new(dens.outputs['Color'], bsdf.inputs['Alpha'])
# relief : hauteur = densité lissée + détail
bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.85; bump.inputs['Distance'].default_value = 30.0
hgt = N.new('ShaderNodeMath'); hgt.operation = 'MULTIPLY_ADD'; hgt.inputs[1].default_value = .7
L.new(m5.outputs['Value'], hgt.inputs[0]); L.new(dens.outputs['Color'], hgt.inputs[2])
hg2 = N.new('ShaderNodeMath'); hg2.operation = 'MULTIPLY_ADD'; hg2.inputs[1].default_value = .45
L.new(fine.outputs['Fac'], hg2.inputs[0]); L.new(hgt.outputs['Value'], hg2.inputs[2])
L.new(hg2.outputs['Value'], bump.inputs['Height']); L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
L.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
clouds.data.materials.append(m)

# ---- atmosphère : liseré bleu fin au limbe + voile léger côté jour
m, nt, N, L = mat('M_atmo'); m.blend_method = 'BLEND'
out = N.new('ShaderNodeOutputMaterial'); mix = N.new('ShaderNodeMixShader'); tr = N.new('ShaderNodeBsdfTransparent'); em = N.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (0.45, 0.65, 1.0, 1); em.inputs['Strength'].default_value = 5.0
lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.08
geo = N.new('ShaderNodeNewGeometry'); dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = SUN
L.new(geo.outputs['Normal'], dot.inputs[0])
day = N.new('ShaderNodeMath'); day.operation = 'MULTIPLY_ADD'; day.inputs[1].default_value = .9; day.inputs[2].default_value = .25
L.new(dot.outputs['Value'], day.inputs[0])
dayc = N.new('ShaderNodeClamp'); L.new(day.outputs['Value'], dayc.inputs['Value'])
pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 9.0
L.new(lw.outputs['Facing'], pw.inputs[0])
haze = N.new('ShaderNodeMath'); haze.operation = 'MULTIPLY_ADD'; haze.inputs[1].default_value = 1.0; haze.inputs[2].default_value = 0.015
L.new(pw.outputs['Value'], haze.inputs[0])
fac = N.new('ShaderNodeMath'); fac.operation = 'MULTIPLY'; L.new(haze.outputs['Value'], fac.inputs[0]); L.new(dayc.outputs['Result'], fac.inputs[1])
L.new(fac.outputs['Value'], mix.inputs['Fac']); L.new(tr.outputs['BSDF'], mix.inputs[1]); L.new(em.outputs['Emission'], mix.inputs[2])
L.new(mix.outputs['Shader'], out.inputs['Surface'])
atmo.data.materials.append(m); atmo.visible_shadow = False; atmo.visible_diffuse = False; atmo.visible_glossy = False

# ---- soleil
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.object
sun.data.energy = 5.5; sun.data.color = (1.0, 0.80, 0.58); sun.data.angle = math.radians(0.53)
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
        sc.render.resolution_x = SIZE * 2; sc.render.resolution_y = SIZE * 2 * 9 // 16; cam_data.angle = math.radians(40); cam_data.sensor_fit = 'HORIZONTAL'
        Lk = Vector((0, -math.sin(math.radians(15)), -math.cos(math.radians(15)))); U = Vector((0, 1, 0)); U = (U - Lk * U.dot(Lk)).normalized()
    else: Lk, U = Vector(FACE[f][0]), Vector(FACE[f][1])
    right = Lk.cross(U)
    M = Matrix(); M.identity()
    for i, v in enumerate((right, U, -Lk)):
        M[0][i], M[1][i], M[2][i] = v.x, v.y, v.z
    cam.matrix_world = M.to_4x4()
    sc.render.filepath = f'{OUT}/{f}.png'
    bpy.ops.render.render(write_still=True)
    print('face', f, 'ok')
