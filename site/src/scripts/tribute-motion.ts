const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')

const finishRunningAnimations = () => {
  for (const animation of document.getAnimations()) animation.finish()
}

motionPreference.addEventListener('change', ({ matches }) => {
  if (matches) finishRunningAnimations()
})

if (!motionPreference.matches) {
  const { animate, inView, stagger } = await import('motion')
  const easeOut = [0.22, 1, 0.36, 1] as const

  const straw = document.querySelector<HTMLElement>('.hero-relic--straw')
  const cutlass = document.querySelector<HTMLElement>('.hero-relic--cutlass')
  const heroLogo = document.querySelector<HTMLElement>('.hero-logo')
  const don = document.querySelector<HTMLElement>('.don')
  const heroCopy = Array.from(document.querySelectorAll<HTMLElement>('[data-hero-copy]'))

  if (straw) {
    animate(
      straw,
      { opacity: [0, 1], x: [-86, 0], y: [-42, 0], rotate: [-32, -9], scale: [0.68, 1] },
      { type: 'spring', visualDuration: 0.52, bounce: 0.26 },
    )
  }

  if (cutlass) {
    animate(
      cutlass,
      { opacity: [0, 1], x: [94, 0], y: [34, 0], rotate: [30, -13], scale: [0.62, 1] },
      { type: 'spring', visualDuration: 0.56, bounce: 0.22, delay: 0.07 },
    )
  }

  if (heroLogo) {
    animate(
      heroLogo,
      { opacity: [0, 1], scale: [0.76, 1.08, 1], rotate: [-7, -1, -2] },
      { duration: 0.62, times: [0, 0.7, 1], ease: easeOut, delay: 0.1 },
    )
  }

  if (don) {
    animate(
      don,
      { opacity: [0, 1], scale: [0.15, 1.24, 1], rotate: [24, 7, 9] },
      { duration: 0.48, times: [0, 0.68, 1], ease: easeOut, delay: 0.32 },
    )
  }

  if (heroCopy.length > 0) {
    animate(
      heroCopy,
      { opacity: [0, 1], y: [22, 0] },
      { duration: 0.5, ease: easeOut, delay: stagger(0.055, { startDelay: 0.18 }) },
    )
  }

  const relics = Array.from(document.querySelectorAll<HTMLElement>('.chapter-relic'))

  relics.forEach((relic, index) => {
    const restingRotation = Number.parseFloat(relic.dataset.restRotation ?? '0')
    const direction = index % 2 === 0 ? 1 : -1

    inView(
      relic,
      () => {
        relic.classList.add('is-animating')
        const entrance = animate(
          relic,
          {
            opacity: [0, 1],
            y: [54, -7, 0],
            rotate: [restingRotation + direction * 12, restingRotation - direction * 2, restingRotation],
            scale: [0.7, 1.06, 1],
          },
          {
            type: 'spring',
            visualDuration: 0.55,
            bounce: 0.3,
          },
        )

        entrance.then(() => relic.classList.remove('is-animating'))
      },
      { amount: 0.35 },
    )

    relic.addEventListener('pointerenter', () => {
      if (relic.classList.contains('is-animating')) return
      animate(
        relic,
        { y: -6, scale: 1.055, rotate: restingRotation + direction * 2 },
        { duration: 0.22, ease: easeOut },
      )
    })

    relic.addEventListener('pointerleave', () => {
      if (relic.classList.contains('is-animating')) return
      animate(
        relic,
        { y: 0, scale: 1, rotate: restingRotation },
        { duration: 0.25, ease: easeOut },
      )
    })
  })

  // Final Voyage serial: koma panels ink themselves in as the reader scrolls,
  // staggered in reading order within their page grid.
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'))

  panels.forEach((panel, index) => {
    const grid = panel.closest('.koma-grid')
    const pageIndex = grid
      ? Array.from(grid.querySelectorAll<HTMLElement>('[data-panel]')).indexOf(panel)
      : 0
    const delay = pageIndex * 0.12
    // Slanted panels keep their CSS clip-path, and the tempest has its own
    // thunder entrance — reveal those by drift instead of an ink wipe.
    const slanted =
      panel.classList.contains('koma--slant-r') ||
      panel.classList.contains('koma--slant-l') ||
      panel.classList.contains('koma--tempest')

    inView(
      panel,
      () => {
        if (slanted) {
          animate(
            panel,
            { opacity: [0, 1], y: [34, 0] },
            { duration: 0.5, ease: easeOut, delay },
          )
          return
        }

        const hidden = index % 2 === 0 ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)'
        const reveal = animate(
          panel,
          { clipPath: [hidden, 'inset(0 0 0 0)'], opacity: [0.35, 1] },
          { duration: 0.55, ease: easeOut, delay },
        )

        // Captions and shout lettering overhang the frame — unclip once inked.
        // The frame after the promise resolves, so it lands after Motion
        // commits the final keyframe back onto the inline style.
        reveal.then(() => {
          requestAnimationFrame(() => {
            panel.style.clipPath = ''
            panel.style.opacity = ''
          })
        })
      },
      { amount: 0.2 },
    )
  })

  // Shout lettering bursts once its panel is on stage.
  for (const sfx of document.querySelectorAll<HTMLElement>('.sfx')) {
    inView(
      sfx.parentElement ?? sfx,
      () => {
        animate(
          sfx,
          { opacity: [0, 1], scale: [0.2, 1.2, 1] },
          { duration: 0.45, times: [0, 0.7, 1], ease: easeOut, delay: 0.3 },
        )
      },
      { amount: 0.3 },
    )
  }

  // The storm splash: lightning flash, then the whole panel shudders.
  const tempest = document.querySelector<HTMLElement>('.koma--tempest')
  const flash = tempest?.querySelector<HTMLElement>('.storm-flash')

  if (tempest && flash) {
    inView(
      tempest,
      () => {
        animate(
          flash,
          { opacity: [0, 0.85, 0, 0.55, 0] },
          { duration: 0.7, times: [0, 0.12, 0.3, 0.42, 1], delay: 0.35 },
        )
        animate(
          tempest,
          { x: [0, -7, 6, -4, 3, 0], y: [0, 3, -2, 2, -1, 0] },
          { duration: 0.6, delay: 0.4 },
        )
      },
      { amount: 0.45 },
    )
  }

  // Big scene panels drift against the scroll — the sea keeps moving.
  const { scroll } = await import('motion')
  for (const art of document.querySelectorAll<HTMLElement>(
    '.koma--depart .koma-art, .koma--tempest .koma-art, .koma--landfall .koma-art',
  )) {
    const frame = art.closest<HTMLElement>('.koma')
    if (!frame) continue
    scroll(animate(art, { y: ['-3.5%', '3.5%'] }, { ease: 'linear' }), {
      target: frame,
      offset: ['start end', 'end start'],
    })
  }

  const crew = document.querySelector<HTMLElement>('.crew-epilogue')
  const crewArt = crew?.querySelector<HTMLElement>('.crew-epilogue__art')
  const crewImage = crew?.querySelector<HTMLElement>('.crew-epilogue__image')
  const crewCaption = crew?.querySelector<HTMLElement>('figcaption')
  const crewSfx = crew?.querySelector<HTMLElement>('.crew-epilogue__sfx')

  if (crew && crewArt && crewImage && crewCaption && crewSfx) {
    inView(
      crew,
      () => {
        animate(
          crewArt,
          { clipPath: ['inset(0 50% 0 50%)', 'inset(0 0% 0 0%)'] },
          { duration: 0.82, ease: easeOut },
        )
        animate(
          crewImage,
          { opacity: [0, 1], scale: [1.08, 1] },
          { duration: 0.78, ease: easeOut },
        )
        animate(
          crewCaption,
          { opacity: [0, 1], y: [-22, 0], rotate: [-3, -1] },
          { type: 'spring', visualDuration: 0.54, bounce: 0.24, delay: 0.18 },
        )
        animate(
          crewSfx,
          { opacity: [0, 1], scale: [0.2, 1.18, 1], rotate: [18, 5, 7] },
          { duration: 0.48, times: [0, 0.7, 1], ease: easeOut, delay: 0.48 },
        )
      },
      { amount: 0.24 },
    )
  }
}
