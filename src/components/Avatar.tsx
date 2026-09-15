"use client";

import { avatarColor, initials } from "@/lib/utils";

interface AvatarProps {
  name: string;
  id: string;
  url?: string | null;
  size?: number;
  online?: boolean;
}

export function Avatar({ name, id, url, size = 44, online }: AvatarProps) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ backgroundColor: avatarColor(id), fontSize: size * 0.38 }}
        >
          {initials(name)}
        </div>
      )}
      {online && (
        <span className="absolute bottom-0 end-0 h-3 w-3 rounded-full border-2 border-wa-panel bg-wa-primary" />
      )}
    </div>
  );
}
