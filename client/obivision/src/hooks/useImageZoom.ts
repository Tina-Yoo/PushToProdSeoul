import { useEffect, useRef, useState, type CSSProperties } from "react";

interface UseImageZoomReturn {
  active: boolean;
  overlayRef: React.RefObject<HTMLDivElement>;
  overlayHandlers: {
    onClick: (e: React.MouseEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  };
  imageHandlers: {
    onMouseDown: (e: React.MouseEvent) => void;
  };
  imageStyle: CSSProperties;
  grabbing: boolean;
  didDrag: () => boolean;
}

export function useImageZoom(
  onOpen: () => void,
  onClose: () => void
): UseImageZoomReturn {
  const [active, setActive] = useState(false);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);

  // Open image
  const open = () => {
    setActive(true);
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    hasDraggedRef.current = false;
    onOpen();
  };

  // Close image
  const close = () => {
    setActive(false);
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    onClose();
  };

  // Lock body scroll when active
  useEffect(() => {
    if (active) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [active]);

  // Overlay click handler (close only if not dragging)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !hasDraggedRef.current) {
      close();
    }
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setScale((prev) => {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(prev * delta, 1), 8);
      return newScale;
    });
  };

  // Mouse down handler (start drag)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = {
      x: e.clientX - translate.x,
      y: e.clientY - translate.y,
    };
    setGrabbing(true);
    hasDraggedRef.current = false;
  };

  // Mouse move handler (dragging)
  useEffect(() => {
    if (!grabbing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      // Consider it a drag if moved more than 5px
      if (Math.abs(deltaX - translate.x) > 5 || Math.abs(deltaY - translate.y) > 5) {
        hasDraggedRef.current = true;
      }

      setTranslate({ x: deltaX, y: deltaY });
    };

    const handleMouseUp = () => {
      setGrabbing(false);
      dragStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [grabbing, translate]);

  return {
    active,
    overlayRef,
    overlayHandlers: {
      onClick: handleOverlayClick,
      onWheel: handleWheel,
    },
    imageHandlers: {
      onMouseDown: handleMouseDown,
    },
    imageStyle: {
      transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
      cursor: grabbing ? "grabbing" : "grab",
      transition: grabbing ? "none" : "transform 0.2s ease-out",
    },
    grabbing,
    didDrag: () => hasDraggedRef.current,
  };
}

// Usage note: Call open() externally to activate the zoom overlay
export function createImageZoomOpener() {
  let openFn: (() => void) | null = null;

  return {
    register: (fn: () => void) => {
      openFn = fn;
    },
    open: () => {
      if (openFn) openFn();
    },
  };
}
