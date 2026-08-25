import { useEffect, useRef } from "react";

export default function LocalVideo({ stream, className }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  return <video ref={videoRef} className={className} autoPlay playsInline muted />;
}
