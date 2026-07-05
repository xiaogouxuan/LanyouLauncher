interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap: Record<string, string> = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-14 h-14",
  xl: "w-20 h-20",
};

export function Avatar({
  src,
  alt = "",
  size = "md",
  className = "",
}: AvatarProps) {
  const letter = alt ? alt.charAt(0).toUpperCase() : "?";

  return (
    <div
      className={`${sizeMap[size]} rounded-full overflow-hidden bg-primary-container flex items-center justify-center 
        ring-2 ring-surface/80 shadow-md flex-shrink-0 ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className="text-on-primary-container font-semibold text-sm">{letter}</span>
      )}
    </div>
  );
}
