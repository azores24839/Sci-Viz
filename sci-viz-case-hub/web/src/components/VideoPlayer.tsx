import React, { useState } from 'react';
import { theme } from '../theme';

function parseEmbedUrl(videoUrl: string, videoPlatform: string): string {
  if (videoPlatform === 'bilibili') {
    const match = videoUrl.match(/BV[a-zA-Z0-9]{10}/);
    if (match) {
      return `https://player.bilibili.com/player.html?bvid=${match[0]}&high_quality=1&autoplay=0`;
    }
  }
  if (videoPlatform === 'youtube') {
    let id = '';
    const shortMatch = videoUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) {
      id = shortMatch[1];
    } else {
      const longMatch = videoUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (longMatch) {
        id = longMatch[1];
      }
    }
    if (id) {
      return `https://www.youtube.com/embed/${id}`;
    }
  }
  return videoUrl;
}

function getPlatformUrl(videoUrl: string): string {
  const match = videoUrl.match(/BV[a-zA-Z0-9]{10}/);
  if (match) {
    return `https://www.bilibili.com/video/${match[0]}`;
  }
  let ytId = '';
  const shortMatch = videoUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) {
    ytId = shortMatch[1];
  } else {
    const longMatch = videoUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (longMatch) {
      ytId = longMatch[1];
    }
  }
  if (ytId) {
    return `https://www.youtube.com/watch?v=${ytId}`;
  }
  return videoUrl;
}

function getPlatformName(videoUrl: string, videoPlatform: string): string {
  if (videoPlatform === 'bilibili') return 'Bilibili';
  if (videoPlatform === 'youtube') return 'YouTube';
  return '原始地址';
}

export function VideoPlayer({ videoUrl, videoPlatform, title, style }: {
  videoUrl: string;
  videoPlatform: string;
  title?: string;
  style?: React.CSSProperties;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const embedUrl = parseEmbedUrl(videoUrl, videoPlatform);
  const platformName = getPlatformName(videoUrl, videoPlatform);

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    paddingTop: '56.25%',
    background: theme.colors.bgSubtle,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...style,
  };

  const iframeStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    border: 'none',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: theme.colors.bgSubtle,
    color: theme.colors.text.tertiary,
    fontSize: theme.typography.size.base,
    fontFamily: theme.typography.fontFamily,
    gap: theme.spacing.sm,
    pointerEvents: 'none',
  };

  const linkStyle: React.CSSProperties = {
    color: theme.colors.accent,
    textDecoration: 'none',
    pointerEvents: 'auto',
  };

  const errorOverlayStyle: React.CSSProperties = {
    ...overlayStyle,
  };

  return (
    <div style={containerStyle}>
      {loading && !error && (
        <div style={overlayStyle}>
          <span>加载中...</span>
        </div>
      )}
      {error && (
        <div style={errorOverlayStyle}>
          <span>视频加载失败</span>
          <a
            href={getPlatformUrl(videoUrl)}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
          >
            在 {platformName} 上观看
          </a>
        </div>
      )}
      <iframe
        src={embedUrl}
        title={title || platformName}
        style={iframeStyle}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
      />
    </div>
  );
}
