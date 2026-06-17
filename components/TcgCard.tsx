"use client";

export default function TcgCard({ card }: any) {
  const img = card.image?.url;
  const rarity = card.rarity?.name?.toLowerCase();

  const rarityColor: any = {
    c: "#9ca3af",
    uc: "#22c55e",
    r: "#3b82f6",
    leader: "#f97316",
    sr: "#a855f7",
    sec: "#eab308",
    sp: "#ec4899",
    promo: "#06b6d4",
    "alternative art": "#e5e7eb",
    "manga rare": "#fbbf24",
  };

  const color = rarityColor[rarity] || "#9ca3af";

  return (
    <div
      style={{
        width: 240,
        borderRadius: 16,
        overflow: "hidden",
        position: "relative",
        background: "#0b0b0b",
        boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
        transition: "transform 0.2s ease",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.transform = "translateY(-4px) scale(1.02)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.transform = "translateY(0) scale(1)")
      }
    >
      {/* IMAGE */}
      {img && (
        <img
          src={`http://localhost:1337${img}`}
          style={{
            width: "100%",
            height: 320,
            objectFit: "contain",
            background: "linear-gradient(#0b0b0b, #111)",
            display: "block",
          }}
        />
      )}

      {/* GRADIENT VERY SUBTLE */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,0.6), transparent 55%)",
        }}
      />

      {/* RARITY (clean pill) */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          padding: "3px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          color: "white",
          background: color,
          opacity: 0.9,
        }}
      >
        {card.rarity?.name}
      </div>

      {/* PRICE (kept clean green) */}
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          padding: "3px 10px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          color: "white",
          background: "rgba(34,197,94,0.85)",
        }}
      >
        {card.price}€
      </div>

      {/* NAME */}
      <div
        style={{
          padding: "10px 12px",
          background: "#111",
          color: "white",
          fontWeight: 700,
          fontSize: 13,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {card.name}
      </div>
    </div>
  );
}