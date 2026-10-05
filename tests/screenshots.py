# Browser smoke test: loads dist build in headless Chromium, runs the breach, saves screenshots,
# and fails if the page throws. Needs: pip install playwright && python -m playwright install chromium
# Usage: python tests/screenshots.py
import asyncio, pathlib, sys
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "screenshots"; OUT.mkdir(exist_ok=True)

async def settle(pg, view, dim, timeout=30.0):
    """Wait for ViewManager to reach a (view, dim) pair.

    Not a fixed sleep: a view switch arms a ~1.2s crossfade timeout, and under
    software rendering (swiftshader) a single three.js frame can take 500ms, so
    those timers get starved and a sleep long enough for a fast machine is flaky
    on a slow one. Poll the state the manager actually exposes instead.
    """
    try:
        await pg.wait_for_function(
            "([v, d]) => window.ViewManager.currentView === v && window.ViewManager.currentDim === d"
                           " && !window.ViewManager.isTransitioning",
            arg=[view, dim], timeout=timeout * 1000)
    except Exception:
        got = await pg.evaluate("() => [window.ViewManager.currentView, window.ViewManager.currentDim, window.ViewManager.isTransitioning]")
        print("View did not settle: wanted", [view, dim], "got", got); sys.exit(1)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=swiftshader", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1280, "height": 800})
        errors = []; pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto((ROOT / "dist" / "dam_system_rishiganga.html").as_uri()); await pg.wait_for_timeout(6000)
        await pg.screenshot(path=str(OUT / "01_valley.png"))
        await pg.evaluate("()=>document.querySelector('#rail button:nth-child(5)').click()"); await pg.wait_for_timeout(2500)
        await pg.evaluate("()=>document.querySelector('#btnPlay').click()"); await pg.wait_for_timeout(800)
        await pg.evaluate("()=>{const C=window.DamCore; while(C.ST.t<700) C.step(1);}"); await pg.wait_for_timeout(3000)
        await pg.screenshot(path=str(OUT / "05_breach.png"))
        await pg.evaluate("()=>{const C=window.DamCore; while(!C.ST.done) C.step(4);}"); await pg.wait_for_timeout(2500)
        await pg.evaluate("()=>document.querySelector('#rail button:nth-child(7)').click()"); await pg.wait_for_timeout(3000)
        await pg.screenshot(path=str(OUT / "07_impact.png"))

        # --- 2D map views: the same simulation, drawn flat ---
        # The run above finished, so the peak envelope is what both maps must draw.
        await pg.evaluate("()=>document.querySelector('#btn2D').click()")
        await settle(pg, "local", "2d"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=str(OUT / "08_map2d_peak.png"))

        # the map's own chrome: depth layer, zoomed to the breach
        await pg.evaluate("()=>document.querySelector('#m2dLayers .m2d-l[data-v=\"1\"]').click()")
        await pg.evaluate("()=>document.querySelector('#m2dCams .m2d-l[data-cam=\"breach\"]').click()")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=str(OUT / "09_map2d_depth_breach.png"))
        # the intel panel's layer buttons drive the map too, not just the map's own
        shared = await pg.evaluate("()=>window.DamApp.app.view")
        if shared != 1:
            print("Map layer and intel panel disagree: app.view =", shared); sys.exit(1)

        await pg.evaluate("()=>document.querySelector('#btn2D').click()")
        await settle(pg, "local", "3d")
        await pg.evaluate("()=>document.querySelector('#btnWholeGanga').click()")
        await settle(pg, "basin", "3d"); await pg.wait_for_timeout(800)
        await pg.screenshot(path=str(OUT / "10_basin3d.png"))

        await pg.evaluate("()=>document.querySelector('#btn2D').click()")
        await settle(pg, "basin", "2d"); await pg.wait_for_timeout(800)
        await pg.screenshot(path=str(OUT / "11_basin2d.png"))
        await pg.evaluate("()=>document.querySelectorAll('.b2d-l[data-fit=\"delta\"]')[0].click()")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=str(OUT / "12_basin2d_delta.png"))

        # and the domain button must preserve the dimension it is not changing
        await pg.evaluate("()=>document.querySelector('#btnWholeGanga').click()")
        await settle(pg, "local", "2d")
        await pg.evaluate("()=>document.querySelector('#btn2D').click()")
        await settle(pg, "local", "3d")

        await b.close()
        if errors: print("Page errors:", *errors, sep="\n"); sys.exit(1)
        print("No page errors. Screenshots in", OUT)
asyncio.run(main())
