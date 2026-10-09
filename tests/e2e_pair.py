import asyncio
from playwright.async_api import async_playwright
BASE='http://localhost:4173/'; OUT='test-artifacts/'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--disable-features=WebRtcHideLocalIpsWithMdns'])
        desk=await (await b.new_context(viewport={'width':1280,'height':800})).new_page()
        errs=[]; desk.on('pageerror',lambda e: errs.append(str(e)))
        await desk.goto(BASE+'#/lab/pendulum')
        await desk.wait_for_function("/^[A-Z2-9]{6}$/.test(document.getElementById('code').textContent)",timeout=20000)
        code=await desk.text_content('#code'); print('code',code,'| desk:',await desk.text_content('#conn-text'))
        ph=await (await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)).new_page()
        ph.on('pageerror',lambda e: errs.append('phone:'+str(e)))
        await ph.goto(BASE+'?sensor='+code)
        try:
            await ph.wait_for_function("document.getElementById('status').textContent.includes('已連線')",timeout=25000)
        except Exception:
            print('phone status:',await ph.text_content('#status'),await ph.text_content('#detail'),errs); raise
        print('phone:',await ph.text_content('#status'),'| desk:',await desk.text_content('#conn-text'))
        await ph.click('#enable')
        # 模擬陀螺儀：L=0.5 m, g=9.79 → 以 100 Hz 觸發 devicemotion
        await ph.evaluate("""(()=>{const w=Math.sqrt(9.79/0.5),t0=performance.now();setInterval(()=>{const t=(performance.now()-t0)/1000;const v=-12*w*Math.sin(w*t)*Math.exp(-0.03*t);
          window.dispatchEvent(new DeviceMotionEvent('devicemotion',{rotationRate:{alpha:0.2*v,beta:Math.random()-0.5,gamma:v},interval:10}))},10)})()""")
        await desk.wait_for_function("document.getElementById('conn-text').textContent.includes('串流中')",timeout=10000)
        print('desk:',await desk.text_content('#conn-text'),'| phone:',await ph.text_content('#status'))
        await desk.click('#start'); await desk.wait_for_timeout(9000)
        print('live T',await desk.text_content('#ro-T'),'g',await desk.text_content('#ro-g'),await desk.text_content('#ro-ax'))
        print('phone rec banner visible:',await ph.is_visible('#rec'),'rate',await ph.text_content('#rate'),'sent',await ph.text_content('#sent'))
        await ph.screenshot(path=OUT+'sensor-390-streaming.png')
        await desk.click('#stop'); await desk.wait_for_timeout(300)
        print('final T',await desk.text_content('#ro-T'),'g',await desk.text_content('#ro-g'))
        await desk.screenshot(path=OUT+'lab-phone-paired.png')
        await ph.close(); await desk.wait_for_timeout(3000)
        print('after phone closed desk:',await desk.text_content('#conn-text'))
        print('errors',errs)
        await b.close()
asyncio.run(main())
