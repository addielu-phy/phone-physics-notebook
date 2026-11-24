"""里程碑 2 端對端測試：三個新實驗台的示範模式、匯出、手機版面，以及以模擬感測器完成的手機配對。"""
import asyncio, os, json
from playwright.async_api import async_playwright
BASE = os.environ.get('BASE', 'http://localhost:4173/')
OUT = os.environ.get('OUT', '/workspace/phone-physics-notebook-shots/')
WAV = os.environ.get('WAV', '/tmp/tone330.wav')
def log(*a): print(*a, flush=True)

def watch(pg, errs, tag):
    pg.on('pageerror', lambda e: errs.append(f'{tag} pageerror: {e}'))
    pg.on('console', lambda m: errs.append(f'{tag} console.{m.type}: {m.text}') if m.type == 'error' else None)

async def demo_flow(b, errs):
    ctx = await b.new_context(viewport={'width': 1280, 'height': 860}, accept_downloads=True)
    pg = await ctx.new_page(); watch(pg, errs, 'desk')
    await pg.goto(BASE, wait_until='networkidle'); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(400)
    log('home avail rows', await pg.locator('#exp-rows tr.avail').count(), 'new badges', await pg.locator('.new-badge').count())
    await pg.screenshot(path=OUT + 'home.png', full_page=True)
    # ---- 彈簧 ----
    await pg.goto(BASE + '#/lab/spring/demo'); await pg.wait_for_timeout(1200)
    for m in ['0.200', '0.250', '0.300', '0.350']:
        await pg.fill('#mass', m); await pg.dispatch_event('#mass', 'change'); await pg.wait_for_timeout(600)
        await pg.click('#start'); await pg.wait_for_timeout(6500)
        live = (await pg.text_content('#ro-T'), await pg.text_content('#ro-k'), await pg.text_content('#ro-A'))
        await pg.click('#stop'); await pg.wait_for_timeout(300)
        log('spring m', m, 'live T,k,A', live)
    log('spring fit:', (await pg.inner_text('#fit-box')).replace('\n', ' | '))
    await pg.screenshot(path=OUT + 'spring-demo.png', full_page=True)
    for bid, name in [('csv-sum', 'spring_sum.csv'), ('csv-raw', 'spring_raw.csv'), ('xlsx', 'spring.xlsx')]:
        async with pg.expect_download() as dl: await pg.click('#' + bid)
        d = await dl.value; await d.save_as('/tmp/' + name); log('download', d.suggested_filename)
    # ---- 向心 ----
    await pg.goto(BASE + '#/lab/centripetal/demo'); await pg.wait_for_timeout(1000)
    for r in ['0.120', '0.200']:
        await pg.fill('#radius', r); await pg.dispatch_event('#radius', 'change'); await pg.wait_for_timeout(500)
        await pg.click('#start'); await pg.wait_for_timeout(14000)
        log('centripetal live ω,a,r', await pg.text_content('#ro-w'), await pg.text_content('#ro-a'), await pg.text_content('#ro-r'), '|', await pg.text_content('#tilt-hint'))
        await pg.click('#stop'); await pg.wait_for_timeout(300)
        log('centripetal fit:', (await pg.inner_text('#fit-box')).replace('\n', ' | '))
    await pg.screenshot(path=OUT + 'centripetal-demo.png', full_page=True)
    for bid, name in [('csv-sum', 'cen_sum.csv'), ('csv-raw', 'cen_raw.csv'), ('xlsx', 'cen.xlsx')]:
        async with pg.expect_download() as dl: await pg.click('#' + bid)
        d = await dl.value; await d.save_as('/tmp/' + name); log('download', d.suggested_filename)
    # ---- 聲音 ----
    await pg.goto(BASE + '#/lab/sound-spectrum/demo'); await pg.wait_for_timeout(1500)
    log('sound live f0', await pg.text_content('#ro-f0'), 'note', await pg.text_content('#ro-note'), 'peak', await pg.text_content('#ro-peak'))
    await pg.fill('#tubeL', '0.380'); await pg.fill('#tubeD', '0.030')
    await pg.click('#start'); await pg.wait_for_timeout(3000); await pg.click('#stop'); await pg.wait_for_timeout(300)
    log('sound harmonics:', (await pg.inner_text('#harm-box')).replace('\n', ' | ')[:400])
    await pg.click('[data-max="5000"]'); await pg.wait_for_timeout(400)
    await pg.screenshot(path=OUT + 'sound-demo.png', full_page=True)
    for bid, name in [('csv-sum', 'snd_sum.csv'), ('csv-raw', 'snd_raw.csv'), ('xlsx', 'snd.xlsx')]:
        async with pg.expect_download() as dl: await pg.click('#' + bid)
        d = await dl.value; await d.save_as('/tmp/' + name); log('download', d.suggested_filename)
    await pg.click('[data-theme-toggle]'); await pg.wait_for_timeout(400); await pg.screenshot(path=OUT + 'sound-demo-dark.png'); await pg.click('[data-theme-toggle]')
    # 回到單擺確認沒壞
    await pg.goto(BASE + '#/lab/pendulum/demo'); await pg.wait_for_timeout(1000)
    await pg.click('#start'); await pg.wait_for_timeout(5000); await pg.click('#stop'); await pg.wait_for_timeout(300)
    log('pendulum still OK: T', await pg.text_content('#ro-T'), 'g', await pg.text_content('#ro-g'))
    await ctx.close()

async def mobile_flow(b, errs):
    m = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await m.new_page(); watch(pg, errs, 'mobile')
    for path, name in [('', 'home-390.png'), ('#/lab/spring/demo', 'spring-390.png'), ('#/lab/centripetal/demo', 'centripetal-390.png'), ('#/lab/sound-spectrum/demo', 'sound-390.png')]:
        await pg.goto(BASE + path, wait_until='networkidle'); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(1800)
        sw = await pg.evaluate('document.documentElement.scrollWidth')
        log('mobile', name, 'scrollWidth', sw)
        await pg.screenshot(path=OUT + name, full_page=True)
    for exp, name in [('spring', 'sensor-spring-390.png'), ('centripetal', 'sensor-centripetal-390.png'), ('sound-spectrum', 'sensor-sound-390.png')]:
        await pg.goto(BASE + f'?sensor=ABCDEF&exp={exp}', wait_until='networkidle'); await pg.wait_for_timeout(1500)
        log('sensor page', exp, '|', await pg.text_content('#exp-name'), '|', await pg.text_content('#kind-name'), '|', await pg.text_content('#enable'))
        await pg.screenshot(path=OUT + name, full_page=True)
    await m.close()

MOTION_JS = {
 'spring': """(()=>{const w=Math.sqrt(20/0.265),t0=performance.now();setInterval(()=>{const t=(performance.now()-t0)/1000;const a=-0.025*w*w*Math.cos(w*t)*Math.exp(-0.05*t);
   window.dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:0.05*(Math.random()-.5),y:0.05*(Math.random()-.5),z:9.79+a},rotationRate:{alpha:0,beta:0,gamma:0},interval:10}))},10)})()""",
 'centripetal': """(()=>{const r=0.15,t0=performance.now();const om=t=>{const s=t%20;return s<2?3.5*s:7*Math.exp(-(s-2)/8)};setInterval(()=>{const t=(performance.now()-t0)/1000,w=om(t);
   window.dispatchEvent(new DeviceMotionEvent('devicemotion',{accelerationIncludingGravity:{x:-w*w*r+0.1*(Math.random()-.5),y:0.1*(Math.random()-.5),z:9.79},rotationRate:{alpha:w*180/Math.PI,beta:0.3*(Math.random()-.5),gamma:0.3*(Math.random()-.5)},interval:10}))},10)})()""",
}

async def pair_flow(b, errs, exp, start_ms):
    ctx = await b.new_context(viewport={'width': 1280, 'height': 860}, permissions=['microphone', 'accelerometer', 'gyroscope'])
    desk = await ctx.new_page(); watch(desk, errs, f'desk-{exp}')
    await desk.goto(BASE + f'#/lab/{exp}')
    await desk.wait_for_function("document.getElementById('url').textContent.includes('sensor=')", timeout=30000)
    url = await desk.text_content('#url')
    url = BASE + url[url.index('?'):]
    ph = await ctx.new_page(); watch(ph, errs, f'phone-{exp}')
    await ph.set_viewport_size({'width': 390, 'height': 844})
    await ph.goto(url)
    await ph.wait_for_function("document.getElementById('status').textContent.includes('已連線')", timeout=30000)
    await ph.click('#enable')
    if exp in MOTION_JS: await ph.evaluate(MOTION_JS[exp])
    await desk.wait_for_function("document.getElementById('conn-text').textContent.includes('串流中')", timeout=15000)
    log(f'[{exp}] desk:', await desk.text_content('#conn-text'), '| phone:', await ph.text_content('#status'), await ph.text_content('#rate'))
    if exp == 'spring': await desk.fill('#mass', '0.250')
    if exp == 'centripetal': await desk.fill('#radius', '0.150')
    await desk.click('#start'); await desk.wait_for_timeout(start_ms)
    await ph.screenshot(path=OUT + f'paired-phone-{exp}.png')
    await desk.click('#stop'); await desk.wait_for_timeout(400)
    if exp == 'spring': log(f'[{exp}] T', await desk.text_content('#ro-T'), 'k', await desk.text_content('#ro-k'), '(expected T≈0.7234, k≈20.0·0.25/0.265=18.87)')
    if exp == 'centripetal': log(f'[{exp}]', (await desk.inner_text('#fit-box')).replace('\n', ' | ')[:200])
    if exp == 'sound-spectrum': log(f'[{exp}] f0', await desk.text_content('#ro-f0'), await desk.text_content('#ro-note'), '|', (await desk.inner_text('#harm-box')).replace('\n', ' | ')[:300])
    await desk.screenshot(path=OUT + f'paired-desk-{exp}.png')
    await ctx.close()

async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={WAV}', '--autoplay-policy=no-user-gesture-required'])
        await demo_flow(b, errs)
        await mobile_flow(b, errs)
        for exp, ms in [('spring', 8000), ('centripetal', 15000), ('sound-spectrum', 3000)]:
            try: await pair_flow(b, errs, exp, ms)
            except Exception as e: log(f'[{exp}] PAIR FAILED', repr(e)[:300])
        await b.close()
    # 已知：手機頁未連到電腦時 PeerJS 會報 peer-unavailable（測試用的假配對碼），不算錯誤
    log('errors:', json.dumps(errs, ensure_ascii=False, indent=1))
asyncio.run(main())
