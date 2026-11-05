import pymupdf as f,json,math,collections
from pathlib import Path
p=f.open('public/maps/GFL-COM-CIVL-LYOD-D1376.pdf')[0];draw=p.get_drawings();data=json.loads(Path('src/features/map/drawingLocations.json').read_text());scale=2000/1130
world=lambda p:[round((p[0]-90)*scale,2),round((p[1]-90)*scale,2)]
def inside(point,poly):
 x,y=point;ok=False
 for i,a in enumerate(poly):
  b=poly[i-1]
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:ok=not ok
 return ok
def area(poly):return abs(sum(a[0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*a[1] for i,a in enumerate(poly)))/2
# CAD exports often split a building outline into individual line paths.
segments={}
for d in list(draw):
 c=d['color']
 if not c or not (max(c)-min(c)<.03 or (c[2]>.8 and c[0]<.2 and c[1]<.2)):continue
 for item in d['items']:
  if item[0]!='l':continue
  a=tuple(round(v,1) for v in item[1]);b=tuple(round(v,1) for v in item[2])
  if a==b:continue
  segments.setdefault(a,set()).add(b);segments.setdefault(b,set()).add(a)
visited=set()
for start in segments:
 if start in visited or len(segments[start])!=2:continue
 chain=[start];prev=None;current=start
 for _ in range(500):
  visited.add(current)
  if len(segments[current])!=2:break
  nxt=next((v for v in segments[current] if v!=prev),None)
  if nxt==start:
   if len(chain)>=4:
    rect=f.Rect(min(v[0] for v in chain),min(v[1] for v in chain),max(v[0] for v in chain),max(v[1] for v in chain))
    draw.append({'color':(0,0,1),'rect':rect,'items':[('l',f.Point(*a),f.Point(*b)) for a,b in zip(chain,chain[1:]+[start])]})
   break
  if nxt in visited:break
  chain.append(nxt);prev,current=current,nxt
shapes=[];seen=set()
for index,d in enumerate(draw):
 c=d['color'];r=d['rect']
 # Road reservation and proposed gate annotation, not building footprints.
 if index in {18901,19311,49713}:continue
 if not c or not((c[0]>.8 and c[1]<.2 and c[2]<.2) or (c[2]>.35 and c[0]<.4 and c[1]<.4)) or not (r.x0>=125 and r.y0>=125 and r.x1<1210 and r.y1<1045):continue
 pts=[];valid=True
 for it in d['items']:
  if it[0]=='qu':
   if len(d['items'])!=1:valid=False;break
   q=it[1];pts=[list(q.ul),list(q.ur),list(q.lr),list(q.ll),list(q.ul)]
  elif it[0]=='re':
   q=it[1];pts=[[q.x0,q.y0],[q.x1,q.y0],[q.x1,q.y1],[q.x0,q.y1],[q.x0,q.y0]]
  elif it[0]=='l':
   a,b=list(it[1]),list(it[2]);
   if pts and math.dist(pts[-1],a)>.4:valid=False;break
   if not pts:pts.append(a)
   pts.append(b)
  else:valid=False;break
 if not valid or len(pts)<4 or math.dist(pts[0],pts[-1])>.5:continue
 pts=pts[:-1];ar=area(pts)
 if ar<30 or ar>12000 or r.width<4 or r.height<4:continue
 key=tuple(round(v,1) for v in r)
 if key in seen:continue
 seen.add(key)
 matches=[l for l in data['locations'] if inside([l['pdfAnchor']['x'],l['pdfAnchor']['y']],pts)]
 location=matches[0] if matches else None
 name=location['name'] if location else ''
 kind='building'
 if any(x in name.lower() for x in ['pond','lagoon','reservoir']):kind='water'
 elif any(x in name.lower() for x in ['tank','bottling']):kind='tank'
 elif any(x in name.lower() for x in ['yard','brine','salt storage']):kind='yard'
 elif any(x in name.lower() for x in ['plant','boiler','utility','utilities','section','recovery']):kind='process'
 if index in {48913,70900}:kind='yard' # Plot reservations, not roofed buildings.
 height={'building':18,'process':24,'tank':4,'yard':2,'water':1}[kind]+(index%4)*2
 shapes.append({'id':f'CAD-{index}','points':[world(pt) for pt in pts],'kind':kind,'height':height,'locationId':location['id'] if location else None,'name':name,'sourcePath':index})
# Keep inner outlines over larger site areas from becoming stacks of buildings.
shapes=[s for s in shapes if not any(s!=other and area(s['points'])>area(other['points'])*2 and all(inside(v,s['points']) for v in other['points']) for other in shapes)]
# Tree canopy symbols in the original green linework, clustered to avoid rendering individual leaves.
review=json.loads(Path('src/features/map/reviewedFootprints.json').read_text(encoding='utf-8'))
for update in review['updates']:
 for shape in shapes:
  if shape['id']==update['id']:shape.update(update)
for item in review['additions']:
 shapes.append({'id':item['id'] if 'id' in item else 'REVIEW-'+item['locationId'],'points':[world(pt) for pt in item['pdfPoints']],
  'kind':item['kind'],'height':18 if item['kind']=='building' else 24 if item['kind']=='process' else 2,
  'locationId':item['locationId'],'locationIds':item.get('locationIds',[item['locationId']]),
  'name':item['name'],'sourcePath':item['sourcePaths'][0],'sourcePaths':item['sourcePaths'],'reviewMethod':item['method']})
trees=[];cells=set()
for d in draw:
 c=d['color'];r=d['rect']
 if not c or not(c[1]>.8 and c[0]<.15 and c[2]<.4):continue
 if not(.6<r.width<14 and .6<r.height<14):continue
 x=(r.x0+r.x1)/2;y=(r.y0+r.y1)/2
 if not(125<x<1210 and 92<y<1060):continue
 cell=(round(x/7),round(y/7))
 if cell in cells:continue
 cells.add(cell);trees.append(world((x,y)))
# Road centre lines traced in PDF coordinates. Widths are schematic, matching the visible corridors.
roads=[[[140,126],[655,146],[1105,167]],[[145,254],[413,254]],[[269,149],[272,334],[270,445],[315,594],[353,665]],[[414,150],[414,658]],[[501,165],[501,645]],[[662,205],[662,483]],[[766,329],[766,486]],[[843,329],[843,591]],[[1051,207],[1050,483]],[[419,204],[660,204],[1051,210]],[[503,275],[659,275]],[[501,329],[1050,329]],[[272,370],[501,370]],[[416,431],[501,431]],[[503,490],[1049,490]],[[419,556],[501,556]],[[320,599],[413,599]],[[354,666],[967,614],[1051,490]],[[701,491],[701,624]],[[843,548],[967,548]],[[968,679],[1147,661]],[[975,700],[1101,688],[1125,715],[1137,791]],[[975,700],[952,794],[909,860],[887,951],[888,1028],[1042,1028]],[[952,804],[1141,804]],[[1141,804],[1177,1028],[1078,1028]]]
# Reviewed against the source corridors; retain bends instead of crossing facilities.
roads[2]=[[276,149],[276,260],[270,275],[270,435],[264,442],[264,493],[276,526],[304,588],[353,665]]
roads[3]=[[420,150],[420,364],[392,374],[392,548],[413,558],[413,645]]
roads[8]=[[1057,207],[1057,483]]
roads[11]=[[501,329],[650,329],[662,326],[835,326],[843,334]]
roads[13]=[[392,431],[501,431]]
roads[14]=[[503,496],[690,496],[705,490],[835,490]]
roads[16]=[[320,599.7],[413,599.7]]
roads[18]=[[704,491],[704,624]]
roads[19]=[[843,544.7],[967,544.7]]
roads[17]=[[354,666],[954,614],[1057,490]]
roads.extend([[[843,498],[1035,498],[1057,483]],[[920,318],[1057,318]]])
roads[25]=[[843,494],[1035,494],[1057,483]] # North of the recovered Control Room footprint.
roads[9]=[[419,204],[660,204],[835,204],[850,211],[1051,211]] # Follow the corridor below the reservoir.
boundary=[[135,122],[1106,162],[1120,470],[1138,665],[1200,1045],[1073,1045],[1069,1008],[1049,1007],[1046,1045],[870,1040],[867,1015],[880,904],[909,844],[943,791],[968,686],[360,704],[315,623],[238,495],[177,387],[143,256],[135,122]]
# Keep schematic road shoulders outside raised CAD footprints, including tight corridors.
def point_segment(p,a,b):
 dx,dy=b[0]-a[0],b[1]-a[1];den=dx*dx+dy*dy
 t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
 return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def edge_distance(a,b,c,d):
 if cross(a,b,c)*cross(a,b,d)<0 and cross(c,d,a)*cross(c,d,b)<0:return 0
 return min(point_segment(a,c,d),point_segment(b,c,d),point_segment(c,a,b),point_segment(d,a,b))
road_points=[[world(p) for p in line] for line in roads]
road_widths=[]
for line in road_points:
 widths=[]
 for a,b in zip(line,line[1:]):
  clearance=min(edge_distance(a,b,c,s['points'][i-1]) for s in shapes if s['kind']!='yard' for i,c in enumerate(s['points']))
  if clearance<.5:raise ValueError(f'Road intersects a raised outline: {a} -> {b}: '+str([(s['id'],s['name']) for s in shapes if s['kind']!='yard' and min(edge_distance(a,b,c,s['points'][i-1]) for i,c in enumerate(s['points']))<.5]))
  widths.append(round(min(15,2*(clearance-.35)),3))
 road_widths.append(widths)
result={'sourceDrawing':data['drawing'],'heightBasis':'Illustrative, not specified in the source PDF','structures':shapes,'trees':trees,'roads':road_points,'roadWidths':road_widths,'boundary':[world(p) for p in boundary]}
Path('src/features/map/plantWorld.json').write_text(json.dumps(result,separators=(',',':')))
print('Structures',len(shapes),'trees',len(trees),'roads',len(roads));print(collections.Counter(s['kind'] for s in shapes))
# Plan QA: cyan outlines are the selected CAD footprints.
for s in shapes:
 points=[f.Point(x/scale+90,y/scale+90) for x,y in s['points']];p.draw_polyline(points+[points[0]],color=(0,.45,.7),width=.7)
Path('tmp/pdfs').mkdir(parents=True,exist_ok=True)
p.get_pixmap(matrix=f.Matrix(1.5,1.5),clip=f.Rect(90,90,1220,1070),alpha=False).save('tmp/pdfs/world-footprints-check.png')

