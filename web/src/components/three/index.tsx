"use client";
/**
 * The only entry point for Three.js / R3F components. Every scene is loaded with next/dynamic and
 * ssr:false so no R3F module is ever evaluated on the server or imported by a server component.
 */
import dynamic from "next/dynamic";

const Placeholder = ({ className }: { className?: string }) => <div className={className} aria-hidden />;

export const ScanFace = dynamic(() => import("./ScanFace").then((m) => m.ScanFace), { ssr: false, loading: () => <Placeholder className="h-full w-full" /> });
export const CornerObject = dynamic(() => import("./CornerObjects").then((m) => m.CornerObject), { ssr: false, loading: () => <Placeholder className="h-full w-full" /> });
export const DomeScene = dynamic(() => import("./DomeScene").then((m) => m.DomeScene), { ssr: false, loading: () => <Placeholder className="h-full w-full" /> });
