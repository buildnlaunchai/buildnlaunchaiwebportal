/**
 * The "Spark" ambient background — the reference's green gradient with faint
 * orbit arcs, a couple of glowing lime arc highlights, and small glowing dots.
 * Fixed, behind content, pointer-events-none. Mounted on the loud marketing
 * surfaces (/tools, /changelog) and the app shell.
 *
 * The `.spark-bg` class supplies the gradient + fixed positioning; the SVG here
 * draws the orbits over it. Purely decorative — aria-hidden, no motion.
 */
export function SparkBackground() {
  return (
    <div aria-hidden className="spark-bg">
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <filter id="sbGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* faint orbit lines — thin intersecting circles */}
        <g stroke="#bfe27a" strokeOpacity="0.1" strokeWidth="1">
          <circle cx="1350" cy="120" r="760" />
          <circle cx="250" cy="820" r="700" />
          <circle cx="820" cy="1150" r="780" />
          <circle cx="1560" cy="780" r="460" />
        </g>

        {/* glowing arc highlights — short bright segments on the orbits */}
        <g stroke="#d4f45a" strokeWidth="3" strokeLinecap="round" filter="url(#sbGlow)">
          <circle cx="1350" cy="120" r="760" strokeDasharray="150 6000" strokeDashoffset="1180" />
          <circle cx="820" cy="1150" r="780" strokeDasharray="150 6000" strokeDashoffset="3380" />
        </g>

        {/* glowing dots sitting on the orbits */}
        <g fill="#eaffc0" filter="url(#sbGlow)">
          <circle cx="470" cy="330" r="4" />
          <circle cx="1300" cy="705" r="4" />
        </g>
      </svg>
    </div>
  );
}
