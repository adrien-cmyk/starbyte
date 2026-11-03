import cv2,numpy as np
R='/home/claude/os01/'
for k in ('front','rear','right','top'):
    g=cv2.imread(R+f'ref/{k}.png',0).astype(np.float32)/255
    g=cv2.resize(g,None,fx=2,fy=2,interpolation=cv2.INTER_CUBIC)
    L=np.clip((g-.28)/(.92-.28),0,1)   # trait noir -> 0, papier -> 1
    L=L**1.15
    cv2.imwrite(R+f'ref/ln_{k}.png',(L*255).astype(np.uint8))
    print(k,L.shape)
