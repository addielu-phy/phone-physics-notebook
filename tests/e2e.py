import asyncio, sys, json
from playwright.async_api import async_playwright
BASE='http://localhost:4173/'
OUT='/workspace/phone-physics-notebook/test-artifacts/'
def log(*a): print(*a, flush=True)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1280,'height':800},accept_downloads=True)
        pg=await ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.goto(BASE,wait_until='networkidle'); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(500)
        rows=await pg.locator('#exp-rows tr').count(); av=await pg.locator('#exp-rows tr.avail').count(); soon=await pg.locator('.soon-badge').count()
        log('home rows',rows,'available',av,'soon',soon)
        await pg.screenshot(path=OUT+'home.png',full_page=True)
        await pg.click('[data-cat="聲音"]'); log('聲音 rows',await pg.locator('#exp-rows tr').count())
        await pg.click('[data-cat="全部"]'); await pg.fill('#search','陀螺儀'); log('search 陀螺儀 rows',await pg.locator('#exp-rows tr').count())
        # demo lab
        await pg.goto(BASE+'#/lab/pendulum/demo'); await pg.wait_for_timeout(1500)
        c1=await pg.evaluate("document.getElementById('live-chart').toDataURL()")
        await pg.wait_for_timeout(700)
        c2=await pg.evaluate("document.getElementById('live-chart').toDataURL()")
        log('chart updates while previewing:',c1!=c2, 'demo flag visible:', await pg.is_visible('#demo-flag'))
        for trial in range(3):
            await pg.click('#start'); await pg.wait_for_timeout(5000)
            if trial==0:
                log('live T',await pg.text_content('#ro-T'),'g',await pg.text_content('#ro-g'),'axis',await pg.text_content('#ro-ax'))
                await pg.click('#pause'); await pg.wait_for_timeout(1000); log('state',await pg.text_content('#run-state'))
                await pg.click('#resume'); await pg.wait_for_timeout(4000)
                await pg.screenshot(path=OUT+'lab-demo-running.png')
            else:
                await pg.wait_for_timeout(1500)
            await pg.click('#stop'); await pg.wait_for_timeout(300)
            log('after stop T',await pg.text_content('#ro-T'),'g',await pg.text_content('#ro-g'))
        log('trials table:', (await pg.inner_text('#trials')).replace('\n',' | '))
        await pg.screenshot(path=OUT+'lab-demo.png',full_page=True)
        async with pg.expect_download() as dl:
            await pg.click('#export')
        d=await dl.value; path=OUT+'export.xlsx'; await d.save_as(path); log('download',d.suggested_filename)
        log('errors',errs)
        # dark theme check
        await pg.click('[data-theme-toggle]'); await pg.wait_for_timeout(300); await pg.screenshot(path=OUT+'lab-demo-dark.png')
        await pg.click('[data-theme-toggle]')
        # phone sensor page, 390px
        m=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
        sp=await m.new_page(); await sp.goto(BASE+'?sensor=ABCDEF',wait_until='networkidle'); await sp.evaluate('document.fonts.ready'); await sp.wait_for_timeout(2500)
        await sp.screenshot(path=OUT+'sensor-390.png',full_page=True)
        log('sensor (no desk) status:',await sp.text_content('#status'))
        await b.close()
asyncio.run(main())
