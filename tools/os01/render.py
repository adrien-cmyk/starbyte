"""Assemblage Blender + rendu Cycles. usage: render.py tag view1,view2 [samples] [scale%] [--blend]"""
import sys,math,os
import bpy,numpy as np
sys.path.insert(0,os.path.dirname(__file__))
from kit import *
import build_all
LNG=None
def line_group():
    """groupe : projette les 4 planches au trait selon la normale -> facteur multiplicatif (découpage)"""
    global LNG
    if LNG: return LNG
    g=bpy.data.node_groups.new('OS_LINES','ShaderNodeTree')
    g.interface.new_socket('Fac',in_out='OUTPUT',socket_type='NodeSocketFloat')
    N=g.nodes;Lk=g.links
    tc=N.new('ShaderNodeTexCoord');geo=N.new('ShaderNodeNewGeometry')
    sep=N.new('ShaderNodeSeparateXYZ');Lk.new(tc.outputs['Object'],sep.inputs[0])
    sn=N.new('ShaderNodeSeparateXYZ');Lk.new(geo.outputs['True Normal'],sn.inputs[0])
    def M(op,a,b=None,cl=False):
        n=N.new('ShaderNodeMath');n.operation=op;n.use_clamp=cl
        for i,x in enumerate((a,b)):
            if x is None: continue
            if isinstance(x,(int,float)): n.inputs[i].default_value=x
            else: Lk.new(x,n.inputs[i])
        return n.outputs[0]
    x,y,z=sep.outputs
    nx,ny,nz=sn.outputs
    def tex(name,u,v):
        im=bpy.data.images.load(f'/home/claude/os01/out/ln_{name}.jpg');im.colorspace_settings.name='Non-Color'
        t=N.new('ShaderNodeTexImage');t.image=im;t.interpolation='Linear';t.extension='CLIP'
        cb=N.new('ShaderNodeCombineXYZ');Lk.new(u,cb.inputs[0]);Lk.new(v,cb.inputs[1]);Lk.new(cb.outputs[0],t.inputs[0])
        return t.outputs[0]
    vv=M('DIVIDE',M('ADD',M('SUBTRACT',0,M('SUBTRACT',457,z)),941),941)   # 1-(457-z)/941
    ufront=M('DIVIDE',M('ADD',836.5,x),1672);urear=M('DIVIDE',M('SUBTRACT',836.5,x),1672);uside=M('DIVIDE',M('ADD',836.5,y),1672)
    K=1.3
    utop=M('DIVIDE',M('ADD',627,M('DIVIDE',x,K)),1254);vtop=M('DIVIDE',M('ADD',M('SUBTRACT',1254,605),M('DIVIDE',y,K)),1254)
    F=tex('front',ufront,vv);R_=tex('rear',urear,vv);S=tex('right',uside,vv);T=tex('top',utop,vtop)
    # poids : normale^4 répartie
    p=lambda a:M('POWER',M('ABSOLUTE',a),6)
    wx=p(nx);wz=p(nz)
    wyf=M('MULTIPLY',p(ny),M('LESS_THAN',ny,0));wyr=M('MULTIPLY',p(ny),M('GREATER_THAN',ny,0))
    tot=M('MAXIMUM',M('ADD',M('ADD',wx,wz),M('ADD',wyf,wyr)),1e-4)
    acc=M('ADD',M('ADD',M('MULTIPLY',wx,S),M('MULTIPLY',wz,T)),M('ADD',M('MULTIPLY',wyf,F),M('MULTIPLY',wyr,R_)))
    out=M('DIVIDE',acc,tot)
    o=N.new('NodeGroupOutput');Lk.new(out,o.inputs[0])
    LNG=g;return g
def mat(name):
    m=bpy.data.materials.new('M_OS_'+name);m.use_nodes=True
    n=m.node_tree;P=n.nodes['Principled BSDF'];c=COL[name]
    P.inputs['Base Color'].default_value=(*c,1)
    rough={'WHITE':.48,'WHITE2':.55,'GREY':.5,'DARK':.6,'STEEL':.38,'YELLOW':.42,'SPHERE':.32,'DECK':.65}.get(name,.5)
    metal={'WHITE':.05,'WHITE2':.1,'GREY':.75,'DARK':.5,'STEEL':.9,'YELLOW':.25,'SPHERE':.4,'DECK':.5}.get(name,0)
    P.inputs['Roughness'].default_value=rough;P.inputs['Metallic'].default_value=metal
    if name in('BLUE','AMBER','RED','LIGHT'):
        st={'BLUE':1.5,'AMBER':1.35,'RED':1.5,'LIGHT':1.2}[name]
        P.inputs['Emission Color'].default_value=(*c,1);P.inputs['Emission Strength'].default_value=st
        P.inputs['Base Color'].default_value=(0.02,0.02,0.02,1)
    if name in('WHITE','WHITE2','YELLOW','SPHERE','GREY','STEEL'):
        tc=n.nodes.new('ShaderNodeTexCoord')
        nz=n.nodes.new('ShaderNodeTexNoise');nz.inputs['Scale'].default_value=.33;nz.inputs['Detail'].default_value=11;nz.inputs['Roughness'].default_value=.68
        n.links.new(tc.outputs['Object'],nz.inputs['Vector'])
        nz2=n.nodes.new('ShaderNodeTexNoise');nz2.inputs['Scale'].default_value=.018;nz2.inputs['Detail'].default_value=4
        n.links.new(tc.outputs['Object'],nz2.inputs['Vector'])
        r=n.nodes.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=.66;r.color_ramp.elements[1].position=.70
        k={'WHITE':.32,'WHITE2':.4,'YELLOW':.35,'SPHERE':.45,'GREY':1.9,'STEEL':.55}[name]
        c2=[min(1,x*k) for x in c]
        r.color_ramp.elements[0].color=(*c,1);r.color_ramp.elements[1].color=(*c2,1)
        n.links.new(nz.outputs['Fac'],r.inputs['Fac'])
        r2=n.nodes.new('ShaderNodeValToRGB');r2.color_ramp.elements[0].position=.32;r2.color_ramp.elements[1].position=.68
        r2.color_ramp.elements[0].color=(.86,.84,.82,1);r2.color_ramp.elements[1].color=(1,1,1,1)
        n.links.new(nz2.outputs['Fac'],r2.inputs['Fac'])
        mx=n.nodes.new('ShaderNodeMixRGB');mx.blend_type='MULTIPLY';mx.inputs[0].default_value=1
        n.links.new(r.outputs['Color'],mx.inputs[1]);n.links.new(r2.outputs['Color'],mx.inputs[2])
        last=mx.outputs[0]
        if name in('GREY','STEEL'):
            # fines lignes de panneaux (triaxial), échelle différente par matière
            sc=n.nodes.new('ShaderNodeSeparateXYZ');n.links.new(tc.outputs['Object'],sc.inputs[0])
            ms=[]
            for ax,per in zip(('X','Y','Z'),(11.3,11.3,9.1) if name=='GREY' else (7.3,7.3,6.1)):
                d=n.nodes.new('ShaderNodeMath');d.operation='DIVIDE';n.links.new(sc.outputs[ax],d.inputs[0]);d.inputs[1].default_value=per
                f=n.nodes.new('ShaderNodeMath');f.operation='FRACT';n.links.new(d.outputs[0],f.inputs[0])
                l=n.nodes.new('ShaderNodeMath');l.operation='LESS_THAN';n.links.new(f.outputs[0],l.inputs[0]);l.inputs[1].default_value=.055
                ms.append(l)
            mxm=n.nodes.new('ShaderNodeMath');mxm.operation='MAXIMUM';n.links.new(ms[0].outputs[0],mxm.inputs[0]);n.links.new(ms[1].outputs[0],mxm.inputs[1])
            mxn=n.nodes.new('ShaderNodeMath');mxn.operation='MAXIMUM';n.links.new(mxm.outputs[0],mxn.inputs[0]);n.links.new(ms[2].outputs[0],mxn.inputs[1])
            mul=n.nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY'
            n.links.new(mxn.outputs[0],mul.inputs[0]);n.links.new(mx.outputs[0],mul.inputs[1]);mul.inputs[2].default_value=(.3,.3,.3,1)
            last=mul.outputs[0]
        # découpage de la planche (traits) sur toutes les surfaces
        lg=n.nodes.new('ShaderNodeGroup');lg.node_tree=line_group()
        mp=n.nodes.new('ShaderNodeMath');mp.operation='ADD';mp.use_clamp=True
        n.links.new(lg.outputs[0],mp.inputs[0]);mp.operation='MULTIPLY_ADD';mp.inputs[1].default_value={'WHITE':.34,'WHITE2':.38,'SPHERE':.12,'YELLOW':.3,'GREY':.5,'STEEL':.45}[name];mp.inputs[2].default_value=1-mp.inputs[1].default_value
        mu=n.nodes.new('ShaderNodeMixRGB');mu.blend_type='MULTIPLY';mu.inputs[0].default_value=1
        n.links.new(last,mu.inputs[1])
        cmb=n.nodes.new('ShaderNodeCombineXYZ')
        for ii in range(3): n.links.new(mp.outputs[0],cmb.inputs[ii])
        n.links.new(cmb.outputs[0],mu.inputs[2])
        ao=n.nodes.new('ShaderNodeAmbientOcclusion');ao.samples=6;ao.inputs['Distance'].default_value=9
        pw_=n.nodes.new('ShaderNodeMath');pw_.operation='POWER';n.links.new(ao.outputs['AO'],pw_.inputs[0]);pw_.inputs[1].default_value=1.3
        cb2=n.nodes.new('ShaderNodeCombineXYZ')
        for ii in range(3): n.links.new(pw_.outputs[0],cb2.inputs[ii])
        mu2=n.nodes.new('ShaderNodeMixRGB');mu2.blend_type='MULTIPLY';mu2.inputs[0].default_value=1
        n.links.new(mu.outputs[0],mu2.inputs[1]);n.links.new(cb2.outputs[0],mu2.inputs[2])
        n.links.new(mu2.outputs[0],P.inputs['Base Color'])
    return m
def assemble(P):
    mats={m:mat(m) for m in MATS}
    col=bpy.data.collections.new('OS01');bpy.context.scene.collection.children.link(col)
    for name,b in P.items():
        V,F,Mi=b.arrays()
        if len(F)==0: continue
        me=bpy.data.meshes.new('DC_'+name)
        me.from_pydata(V.tolist(),[],F)
        for m in MATS: me.materials.append(mats[m])
        me.polygons.foreach_set('material_index',Mi.astype(np.int32))
        me.update();me.validate()
        # lissage par angle
        me.polygons.foreach_set('use_smooth',np.ones(len(me.polygons),bool))
        try: me.set_sharp_from_angle(angle=math.radians(32))
        except Exception as e: print('sharp',e)
        o=bpy.data.objects.new('DC_'+name,me);col.objects.link(o)
    return col
VIEWS={'front':((0,-3000,0),(90,0,0)),'rear':((0,3000,0),(90,0,180)),'right':((3000,0,0),(90,0,90)),'top':((0,0,3000),(0,0,0))}
def cam(view,scn,res):
    c=bpy.data.cameras.new(view);ob=bpy.data.objects.new('CAM_'+view,c);scn.collection.objects.link(ob)
    if view in VIEWS:
        c.type='ORTHO'
        p,r=VIEWS[view];ob.rotation_euler=[math.radians(a) for a in r]
        if view=='top':
            K=1.3;c.ortho_scale=1254*K;ob.location=((627-627)*K,(605-627)*K*-1*-1 if False else (627-605)*K*-1+0,3000)
            ob.location=(0,(605-627)*K,3000)
            res=(1254,1254)
        else:
            c.ortho_scale=1672
            cz=457-470.5
            ob.location=(p[0],p[1],cz)
            res=(1672,941)
    else:
        c.type='PERSP';c.lens=view.get('lens',60) if isinstance(view,dict) else 60
    c.clip_end=20000;c.clip_start=1
    return ob,res
def lights(scn):
    w=bpy.data.worlds.new('w');scn.world=w;w.use_nodes=True
    w.node_tree.nodes['Background'].inputs[0].default_value=(.5,.55,.65,1);w.node_tree.nodes['Background'].inputs[1].default_value=.12
    for rot,e,col in (((52,0,-38),2.6,(1,.94,.84)),((72,0,140),.8,(.8,.87,1.)),((115,0,30),.6,(.8,.85,1.)),((62,0,60),.6,(1,.95,.9))):
        s=bpy.data.lights.new('sun','SUN');s.energy=e;s.color=col;s.angle=math.radians(3)
        o=bpy.data.objects.new('sun',s);o.rotation_euler=[math.radians(a) for a in rot];scn.collection.objects.link(o)
def main():
    a=sys.argv[1:]
    tag=a[0];views=a[1].split(',');spp=int(a[2]) if len(a)>2 else 24;pct=int(a[3]) if len(a)>3 else 100
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn=bpy.context.scene
    P=build_all.parts();assemble(P);lights(scn)
    scn.render.engine='CYCLES';scn.cycles.samples=spp;scn.cycles.use_denoising=True;scn.cycles.max_bounces=4
    scn.cycles.device='CPU';scn.render.threads=2
    scn.view_settings.view_transform='Standard';scn.view_settings.look='None'
    scn.render.film_transparent=True
    for v in views:
        if v.startswith('hero'):
            ob,res=cam('front',scn,None)
            ob.data.type='PERSP';ob.data.lens=58;ob.data.clip_end=30000
            d=2400
            ob.data.lens=26
            ob.location=(-520,-1210,520);tgt=np.array((10,-30,-10))
            dirv=tgt-np.array(ob.location);rx=math.atan2(math.hypot(dirv[0],dirv[1]),-dirv[2]);rz=math.atan2(dirv[1],dirv[0])-math.pi/2
            ob.rotation_euler=(rx,0,rz);res=(1448,1086)
        else:
            ob,res=cam(v,scn,None)
        scn.camera=ob
        # lampe de face (lumière d'appoint alignée sur la vue, comme la planche couleur)
        hl=bpy.data.objects.get('headlamp')
        if hl is None:
            d=bpy.data.lights.new('headlamp','SUN');d.energy=.8;d.color=(1,.97,.93);d.angle=math.radians(8)
            hl=bpy.data.objects.new('headlamp',d);scn.collection.objects.link(hl)
        hl.rotation_euler=ob.rotation_euler
        scn.render.resolution_x,scn.render.resolution_y=res;scn.render.resolution_percentage=pct
        scn.render.filepath=f'/home/claude/os01/rend/{tag}_{v}.png'
        bpy.ops.render.render(write_still=True)
    if '--blend' in a:
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=f'/home/claude/os01/out/{tag}.blend',compress=True)
main()
