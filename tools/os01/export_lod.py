import bpy,sys,math,os,random
sys.path.insert(0,'.')
import numpy as np, kit
kit.LOD=True
from kit import *
import m1_ring,m2_core,m3_mod,m4_dress,m5_green,m6_relief
P={}
for m in (m1_ring,m2_core,m3_mod,m4_dress,m6_relief): P.update(m.build())
KEEP=('relief','ring','arms','hub','tower','spine','cranes','towers','dress','fine2','fine3')
Q={k:P[k] for k in KEEP}
g=m5_green.apply(P,amin=70.,seed=9,dens=.10)
Q['green']=g
tot=0
for k,b in Q.items():
    n=len(b.tris()[1]);tot+=n;print(k,n)
print('total',tot)
bpy.ops.wm.read_factory_settings(use_empty=True)
mats={m:bpy.data.materials.new('M_OS_'+m) for m in MATS}
for m,mm in mats.items():
    mm.use_nodes=True;mm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*COL[m],1)
col=bpy.context.scene.collection
for name,b in Q.items():
    V,F,Mi=b.arrays()
    me=bpy.data.meshes.new('DC_'+name);me.from_pydata(V.tolist(),[],F)
    for m in MATS: me.materials.append(mats[m])
    me.polygons.foreach_set('material_index',Mi.astype(np.int32));me.update();me.validate()
    import bmesh
    bm=bmesh.new();bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
    me.polygons.foreach_set('use_smooth',np.ones(len(me.polygons),bool));me.set_sharp_from_angle(angle=math.radians(32))
    o=bpy.data.objects.new('DC_'+name,me);col.objects.link(o)
# passe à 150 000 triangles max : collapse sur les parties denses
def tris():
    return sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in col.objects)
print('avant',tris())
cur=tris();target=165000
if cur>target:
    r=target/cur
    for o in col.objects:
        if o.name in('DC_cranes','DC_hub','DC_tower'): continue
        md=o.modifiers.new('d','DECIMATE');md.ratio=max(.3,(target-sum(sum(len(p.vertices)-2 for p in x.data.polygons) for x in col.objects if x.name in('DC_cranes','DC_hub','DC_tower')))/max(1,cur-sum(sum(len(p.vertices)-2 for p in x.data.polygons) for x in col.objects if x.name in('DC_cranes','DC_hub','DC_tower'))))
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier='d')
print('apres',tris())
for o in col.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath='/home/claude/os01/out/os01_vitrine.glb',export_format='GLB',use_selection=True,export_apply=True,export_materials='EXPORT',export_yup=False,export_image_format='NONE')
print(os.path.getsize('/home/claude/os01/out/os01_vitrine.glb')/1e6,'Mo')
