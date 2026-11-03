"""Modèle de jeu du chantier OS-01 : même gabarit que l'ancien (±217 m), glTF Y haut, hangar vers −Z (face à la caméra de départ)."""
import bpy,sys,math,os,gzip,bmesh
sys.path.insert(0,'.')
import numpy as np, kit
kit.LOD=True
from kit import *
import m1_ring,m2_core,m3_mod,m4_dress,m5_green,m6_relief
P={}
for m in (m1_ring,m2_core,m3_mod,m4_dress,m6_relief): P.update(m.build())
Q={k:P[k] for k in ('relief','ring','arms','hub','tower','spine','cranes','towers','dress','fine2','fine3')}
Q['green']=m5_green.apply(P,amin=70.,seed=9,dens=.10)
S=217.0/806.0
OUT='/home/claude/os01/out/sb_os01.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
mats={m:bpy.data.materials.new('M_OS_'+m if m!='RED' else 'M_KV_NAV_ROUGE') for m in MATS}
col=bpy.context.scene.collection
KEEP={'cranes','hub','tower'}
objs=[]
for name,b in Q.items():
    V,F,Mi=b.arrays()
    me=bpy.data.meshes.new(name);me.from_pydata(V.tolist(),[],F)
    for m in MATS: me.materials.append(mats[m])
    me.polygons.foreach_set('material_index',Mi.astype(np.int32));me.update();me.validate()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
    me.polygons.foreach_set('use_smooth',np.ones(len(me.polygons),bool));me.set_sharp_from_angle(angle=math.radians(32))
    o=bpy.data.objects.new(name,me);col.objects.link(o);objs.append(o)
def tris(os_): return sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in os_)
cur=tris(objs);keep=tris([o for o in objs if o.name in KEEP]);target=148000
r=max(.3,(target-keep)/max(1,cur-keep))
for o in objs:
    if o.name in KEEP: continue
    md=o.modifiers.new('d','DECIMATE');md.ratio=r
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier='d')
print('tris',tris(objs))
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active=objs[0]
bpy.ops.object.join()
o=bpy.context.view_layer.objects.active;o.name='OS01_Coque'
o.scale=(S,S,S);o.rotation_euler=(0,0,math.pi)
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',use_selection=True,export_materials='EXPORT',export_yup=True,export_image_format='NONE')
raw=open(OUT,'rb').read()
open(OUT+'.gz','wb').write(gzip.compress(raw,9))
print(len(raw)/1e6,'Mo',os.path.getsize(OUT+'.gz')/1e6,'Mo gz')
