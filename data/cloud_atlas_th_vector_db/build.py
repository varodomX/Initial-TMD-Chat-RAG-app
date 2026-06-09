import json, os, re
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors
import joblib

out=Path(__file__).parent
records=[
{
'id':'cloud-overview-001','title':'ฐานความรู้เมฆ WMO ภาษาไทย','code':'overview','category':'ภาพรวม','level':'ทุกระดับ','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/home.html','content':'International Cloud Atlas ของ WMO เป็นแหล่งมาตรฐานสำหรับการจำแนกเมฆและปรากฏการณ์อุตุนิยมวิทยา ใช้เป็นภาษากลางในการสื่อสารผลการตรวจเมฆ ช่วยให้ผู้สังเกตอากาศรายงานเมฆได้สอดคล้องกันทั่วโลก ฐานความรู้นี้สรุปและแปลไทยเฉพาะเมฆหลัก 10 สกุล ได้แก่ Ci Cc Cs Ac As Ns Sc St Cu และ Cb เพื่อใช้กับระบบถามตอบ TMDChat หรือน้องแก่น AI'
},
{
'id':'ci-001','title':'เมฆซีร์รัส','code':'Ci','category':'เมฆชั้นสูง','level':'สูง','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/cirrus-ci.html','content':'เมฆซีร์รัส หรือ Cirrus รหัส Ci เป็นเมฆชั้นสูง ลักษณะเป็นเมฆแยกเป็นเส้นบางสีขาว คล้ายเส้นใย เส้นผม ขนนก หรือเป็นแถบแคบ ๆ มีความเงาคล้ายไหม บางครั้งเป็นหย่อมหรือริ้วสีขาว มักไม่มีเงาทึบ ใช้สังเกตว่าบรรยากาศชั้นสูงมีผลึกน้ำแข็งและอาจบ่งชี้การเปลี่ยนแปลงของลมชั้นบน คำสำคัญ: เมฆขนนก เมฆเส้นใย เมฆชั้นสูง cirrus Ci'
},
{
'id':'cc-001','title':'เมฆซีร์โรคิวมูลัส','code':'Cc','category':'เมฆชั้นสูง','level':'สูง','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/cirrocumulus-cc.html','content':'เมฆซีร์โรคิวมูลัส หรือ Cirrocumulus รหัส Cc เป็นเมฆชั้นสูง ลักษณะเป็นแผ่นหรือชั้นบางสีขาว ไม่มีเงา ประกอบด้วยเมฆก้อนเล็กมากคล้ายเม็ด เกล็ด หรือระลอกคลื่น จัดเรียงค่อนข้างสม่ำเสมอ องค์ประกอบส่วนใหญ่มีขนาดปรากฏน้อยกว่า 1 องศา ใช้แยกจาก Altocumulus โดย Cc เล็กกว่า ขาวกว่า และไม่มีเงา คำสำคัญ: เกล็ดปลา เมฆเม็ดเล็ก ชั้นสูง Cc'
},
{
'id':'cs-001','title':'เมฆซีร์โรสเตรตัส','code':'Cs','category':'เมฆชั้นสูง','level':'สูง','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/cirrostratus-cs.html','content':'เมฆซีร์โรสเตรตัส หรือ Cirrostratus รหัส Cs เป็นเมฆชั้นสูง ลักษณะเป็นม่านเมฆสีขาวโปร่งใส อาจมีลักษณะเป็นเส้นใยหรือเรียบ ปกคลุมท้องฟ้าบางส่วนหรือทั้งหมด จุดสังเกตสำคัญคือมักทำให้เกิดปรากฏการณ์ทรงกลดรอบดวงอาทิตย์หรือดวงจันทร์ ใช้แยกจาก Altostratus เพราะ Cs ทำให้เกิด halo ได้เด่นกว่า คำสำคัญ: ม่านเมฆ เมฆโปร่ง ทรงกลด halo Cs'
},
{
'id':'ac-001','title':'เมฆอัลโตคิวมูลัส','code':'Ac','category':'เมฆชั้นกลาง','level':'กลาง','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/altocumulus-ac.html','content':'เมฆอัลโตคิวมูลัส หรือ Altocumulus รหัส Ac เป็นเมฆชั้นกลาง สีขาวหรือเทา หรือมีทั้งขาวและเทา มักมีเงา ประกอบด้วยแผ่น ก้อนกลม ม้วน หรือชั้นเมฆที่อาจเชื่อมต่อกันหรือแยกกัน องค์ประกอบเล็กที่เรียงสม่ำเสมอมักมีขนาดปรากฏ 1 ถึง 5 องศา ใช้แยกจาก Cirrocumulus เพราะ Ac ใหญ่กว่าและมักมีเงา คำสำคัญ: เมฆก้อนชั้นกลาง Altocumulus Ac'
},
{
'id':'as-001','title':'เมฆอัลโตสเตรตัส','code':'As','category':'เมฆชั้นกลาง','level':'กลาง','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/altostratus-as.html','content':'เมฆอัลโตสเตรตัส หรือ Altostratus รหัส As เป็นเมฆชั้นกลาง ลักษณะเป็นแผ่นหรือชั้นสีเทาหรืออมฟ้า อาจเป็นริ้ว เป็นเส้นใย หรือค่อนข้างเรียบ ปกคลุมท้องฟ้าบางส่วนหรือทั้งหมด บางบริเวณบางพอให้เห็นดวงอาทิตย์แบบมัว ๆ เหมือนมองผ่านกระจกฝ้า โดยทั่วไปไม่ทำให้เกิดทรงกลด ใช้แยกจาก Cirrostratus เพราะ As หนากว่าและไม่มี halo คำสำคัญ: เมฆแผ่นชั้นกลาง ดวงอาทิตย์มัว Altostratus As'
},
{
'id':'ns-001','title':'เมฆนิมโบสเตรตัส','code':'Ns','category':'เมฆฝนต่อเนื่อง','level':'กลางถึงต่ำ','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/nimbostratus-ns.html','content':'เมฆนิมโบสเตรตัส หรือ Nimbostratus รหัส Ns เป็นเมฆชั้นหนาสีเทา มักมืด ลักษณะพร่ามัวจากฝนหรือหิมะที่ตกต่อเนื่อง และโดยมากตกถึงพื้น เมฆชนิดนี้หนาพอที่จะบังดวงอาทิตย์ทั้งหมด ใต้ฐานเมฆอาจมีเมฆต่ำฉีกขาดหรือเมฆรุ่ยอยู่ร่วมด้วย อาจแยกจาก Cumulonimbus โดย Ns ให้ฝนต่อเนื่องและไม่มีลักษณะยอดหอคอยหรือทั่งชัดเจน คำสำคัญ: เมฆฝนต่อเนื่อง ฝนพรำ ฝนยาว Nimbostratus Ns'
},
{
'id':'sc-001','title':'เมฆสเตรโตคิวมูลัส','code':'Sc','category':'เมฆชั้นต่ำ','level':'ต่ำ','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/stratocumulus-sc.html','content':'เมฆสเตรโตคิวมูลัส หรือ Stratocumulus รหัส Sc เป็นเมฆชั้นต่ำ สีเทาหรือขาวปนเทา มักมีส่วนมืด ประกอบด้วยก้อนกลม แผ่นกระเบื้อง หรือม้วนเมฆ อาจเชื่อมติดกันหรือแยกกัน โดยปกติไม่เป็นเส้นใย ยกเว้นกรณีมี virga องค์ประกอบที่เรียงสม่ำเสมอส่วนใหญ่มีขนาดปรากฏมากกว่า 5 องศา ใช้แยกจาก Altocumulus เพราะ Sc ก้อนใหญ่กว่าและฐานต่ำกว่า คำสำคัญ: เมฆก้อนแผ่ชั้นต่ำ Stratocumulus Sc'
},
{
'id':'st-001','title':'เมฆสเตรตัส','code':'St','category':'เมฆชั้นต่ำ','level':'ต่ำ','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/stratus-st.html','content':'เมฆสเตรตัส หรือ Stratus รหัส St เป็นเมฆชั้นต่ำสีเทา ฐานค่อนข้างสม่ำเสมอ อาจให้ฝนละออง หิมะ หรือเม็ดหิมะ ถ้ามองเห็นดวงอาทิตย์ผ่านเมฆ ขอบดวงอาทิตย์มักยังเห็นชัด เมฆชนิดนี้โดยทั่วไปไม่ทำให้เกิดทรงกลด ยกเว้นอุณหภูมิต่ำมาก บางครั้งปรากฏเป็นหย่อมฉีกขาด ใช้แยกจากหมอกโดยดูว่าฐานเมฆลอยเหนือพื้นหรือแตะพื้น คำสำคัญ: เมฆชั้นต่ำ แผ่นเทา ฝนละออง Stratus St'
},
{
'id':'cu-001','title':'เมฆคิวมูลัส','code':'Cu','category':'เมฆแนวตั้ง/ชั้นต่ำ','level':'ต่ำถึงแนวตั้ง','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/cumulus-cu.html','content':'เมฆคิวมูลัส หรือ Cumulus รหัส Cu เป็นเมฆแยกเป็นก้อน มักหนาแน่น ขอบคม พัฒนาในแนวดิ่งเป็นเนิน โดม หรือหอคอย ส่วนบนโป่งคล้ายดอกกะหล่ำ ด้านที่โดนแดดมักขาวสว่าง ฐานค่อนข้างมืดและเกือบเป็นแนวนอน บางครั้งอาจมีลักษณะฉีกขาด ใช้สังเกตการยกตัวของอากาศในช่วงกลางวัน หากเติบโตมากอาจพัฒนาเป็น Cumulonimbus ได้ คำสำคัญ: เมฆก้อน เมฆดอกกะหล่ำ คิวมูลัส Cu'
},
{
'id':'cb-001','title':'เมฆคิวมูโลนิมบัส','code':'Cb','category':'เมฆฝนฟ้าคะนอง','level':'แนวตั้งลึก','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/cumulonimbus-cb.html','content':'เมฆคิวมูโลนิมบัส หรือ Cumulonimbus รหัส Cb เป็นเมฆหนักและหนาแน่น มีการพัฒนาในแนวดิ่งมาก รูปร่างคล้ายภูเขาหรือหอคอยขนาดใหญ่ ส่วนบนมักเรียบ เป็นเส้นใยหรือเป็นริ้ว และมักแผ่แบนออกคล้ายทั่งหรือพู่ขนาดใหญ่ ฐานเมฆมักมืด ใต้ฐานอาจมีเมฆต่ำฉีกขาดและอาจมีฝนที่ตกไม่ถึงพื้นหรือ virga เมฆ Cb มักสัมพันธ์กับฝนหนัก ฟ้าคะนอง ลมกระโชก และสภาพอากาศรุนแรง คำสำคัญ: เมฆฝนฟ้าคะนอง เมฆทั่ง Cumulonimbus Cb'
},
{
'id':'compare-001','title':'การแยก Cc Ac Sc จากขนาดก้อนเมฆ','code':'compare','category':'เทคนิคสังเกต','level':'ทุกระดับ','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/home.html','content':'วิธีจำง่ายสำหรับเมฆก้อนหรือระลอก: Cirrocumulus Cc เป็นเมฆชั้นสูง ก้อนเล็กมาก ส่วนใหญ่เล็กกว่า 1 องศา ขาวและไม่มีเงา Altocumulus Ac เป็นเมฆชั้นกลาง ก้อนขนาด 1 ถึง 5 องศา มักมีเงา Stratocumulus Sc เป็นเมฆชั้นต่ำ ก้อนใหญ่กว่า 5 องศา มักมีส่วนมืดและฐานต่ำกว่า ใช้เทียบกับนิ้วมือเมื่อเหยียดแขนเพื่อประเมินขนาดปรากฏ'
},
{
'id':'compare-002','title':'การแยก Cs กับ As','code':'compare','category':'เทคนิคสังเกต','level':'สูง/กลาง','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/home.html','content':'Cirrostratus Cs เป็นม่านเมฆสูงสีขาวโปร่ง มักทำให้เกิดทรงกลดหรือ halo รอบดวงอาทิตย์หรือดวงจันทร์ ส่วน Altostratus As เป็นเมฆแผ่นสีเทาหรืออมฟ้าชั้นกลาง หนากว่า บางส่วนอาจเห็นดวงอาทิตย์มัว ๆ เหมือนผ่านกระจกฝ้า แต่โดยทั่วไปไม่เกิด halo ถ้าเห็น halo ให้คิดถึง Cs ก่อน ถ้าแดดมัวและไม่มี halo ให้พิจารณา As'
},
{
'id':'compare-003','title':'การแยก Ns กับ Cb','code':'compare','category':'เทคนิคสังเกต','level':'ฝน','source':'WMO International Cloud Atlas','url':'https://cloudatlas.wmo.int/en/home.html','content':'Nimbostratus Ns เป็นเมฆฝนต่อเนื่องสีเทามืด หนาทึบ บังดวงอาทิตย์ ฝนมักตกนานและสม่ำเสมอ ส่วน Cumulonimbus Cb เป็นเมฆแนวตั้งลึก มีฐานมืดและยอดสูง บางครั้งมีรูปทั่ง มักให้ฝนหนัก ฟ้าคะนอง ลมกระโชก หรือสภาพอากาศรุนแรง ถ้าฝนตกยาวสม่ำเสมอให้คิดถึง Ns ถ้ามีฟ้าร้อง ยอดสูง หรือฝนหนักเฉียบพลันให้คิดถึง Cb'
}
]
with open(out/'cloud_chunks_th.jsonl','w',encoding='utf-8') as f:
    for r in records:
        f.write(json.dumps(r,ensure_ascii=False)+'\n')
texts=[r['title']+' '+r['code']+' '+r['category']+' '+r['content'] for r in records]
vectorizer=TfidfVectorizer(analyzer='char_wb',ngram_range=(2,5),min_df=1)
X=vectorizer.fit_transform(texts)
nn=NearestNeighbors(n_neighbors=min(5,len(records)), metric='cosine')
nn.fit(X)
joblib.dump(vectorizer,out/'tfidf_vectorizer.joblib')
joblib.dump(X,out/'vectors_sparse.joblib')
joblib.dump(nn,out/'nearest_neighbors_index.joblib')
with open(out/'README.md','w',encoding='utf-8') as f:
    f.write('# Cloud Atlas Thai Vector DB\n\nฐานความรู้เมฆภาษาไทยจาก WMO International Cloud Atlas สำหรับใช้กับ RAG / Next.js / TMDChat\n\nไฟล์หลัก:\n- cloud_chunks_th.jsonl\n- tfidf_vectorizer.joblib\n- vectors_sparse.joblib\n- nearest_neighbors_index.joblib\n- query.py\n\nทดสอบ:\n```bash\npython query.py "เมฆคิวมูโลนิมบัสคืออะไร"\n```\n')
