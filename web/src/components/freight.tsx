import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function HazardTape({ className }: { className?: string }) {
  return <div aria-hidden className={cn("hazard-tape h-1.5 w-full", className)} />
}

export function Stamp({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("stamp text-[10px]", className)}>{children}</span>
}

export function Barcode({ value, className }: { value: string; className?: string }) {
  return (
    <div aria-hidden className={cn("flex h-9 items-stretch", className)}>
      {Array.from(value).map((char, index) => {
        const code = char.charCodeAt(0)
        return (
          <span
            key={index}
            className="bg-foreground"
            style={{
              width: `${(code % 3) + 1}px`,
              marginRight: `${(code % 2) + 1}px`,
            }}
          />
        )
      })}
    </div>
  )
}

export function BayPlate({ id, className }: { id: string; className?: string }) {
  return (
    <span
      className={cn(
        "stencil inline-flex items-center rounded-xs border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground",
        className,
      )}
    >
      BAY-{id.slice(-4).toUpperCase()}
    </span>
  )
}

export function Truck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 164 52" className={className} aria-hidden>
      <defs>
        <linearGradient id="truck-hazard" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8412fc" />
          <stop offset="100%" stopColor="#e105a3" />
        </linearGradient>
      </defs>
      {/* trailer */}
      <rect x="2" y="4" width="110" height="34" rx="3" fill="#ececf2" stroke="#c8c8d2" />
      <rect x="2" y="32" width="110" height="4" fill="url(#truck-hazard)" opacity="0.9" />
      <text
        x="57"
        y="24"
        textAnchor="middle"
        fontFamily="'Saira Stencil One', sans-serif"
        fontSize="12"
        letterSpacing="1"
        fill="#8412fc"
      >
        GR FREIGHT
      </text>
      {/* cab */}
      <path
        d="M118 38 V16 q0 -3 3 -3 h16 q3 0 5 2.5 l8 10 q2 2.4 2 5.5 V38 Z"
        fill="#8412fc"
      />
      <path d="M122 18 h11 l7 9 h-18 Z" fill="#f0e6ff" opacity="0.9" />
      <rect x="148" y="34" width="6" height="4" rx="1" fill="#e105a3" />
      {/* wheels */}
      {[22, 44, 92, 126, 144].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="43" r="7" fill="#17171c" stroke="#3f3f49" />
          <circle cx={cx} cy="43" r="2.5" fill="#6d6d78" />
        </g>
      ))}
    </svg>
  )
}

export function CrateStack({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 140 46" className={className} aria-hidden>
      {[
        { x: 4, y: 20, w: 30, h: 24 },
        { x: 38, y: 20, w: 38, h: 24 },
        { x: 14, y: 0, w: 32, h: 18 },
        { x: 92, y: 14, w: 34, h: 30 },
      ].map((crate, index) => (
        <g key={index}>
          <rect
            x={crate.x}
            y={crate.y}
            width={crate.w}
            height={crate.h}
            rx="1.5"
            fill="#2c2733"
            stroke="#4d4459"
          />
          <line
            x1={crate.x}
            y1={crate.y + crate.h / 2}
            x2={crate.x + crate.w}
            y2={crate.y + crate.h / 2}
            stroke="#4d4459"
          />
          <text
            x={crate.x + crate.w / 2}
            y={crate.y + crate.h / 2 - 3}
            textAnchor="middle"
            fontFamily="'Saira Stencil One', sans-serif"
            fontSize="7"
            fill="#a06ae0"
          >
            GR
          </text>
        </g>
      ))}
    </svg>
  )
}

export function YardStrip({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative hidden h-28 overflow-hidden rounded-lg border border-border sm:block",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-14 bg-muted/60">
        <div className="flex h-full items-end justify-between gap-4 px-5">
          <span className="stencil pb-1.5 text-[10px] tracking-[0.3em] text-muted-foreground">
            Gaucho Racing Freight Terminal
          </span>
          <div className="hidden h-full items-end gap-3 md:flex">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="shutter h-9 w-14 rounded-t-sm border border-b-0 border-border/60"
              />
            ))}
          </div>
        </div>
      </div>
      <div className="hazard-tape-muted absolute inset-x-0 top-14 h-1" />
      <div className="asphalt absolute inset-x-0 bottom-0 top-[3.75rem]">
        <div className="road-line absolute inset-x-0 top-1/2 h-0.5" />
        <div className="truck-west absolute bottom-6 opacity-70">
          <span className="block -scale-x-100">
            <Truck className="h-6 w-auto" />
          </span>
        </div>
        <div className="truck-east absolute bottom-1">
          <Truck className="h-9 w-auto" />
        </div>
      </div>
    </div>
  )
}
