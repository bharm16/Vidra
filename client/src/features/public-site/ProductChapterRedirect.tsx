import { type ReactElement } from "react";
import { Navigate, useParams } from "react-router-dom";

const CHAPTERS = ["images", "video", "editor", "sketch"] as const;

/** Earlier per-tool links (/product/video, /products/sketch) open that chapter of the one product page. */
export function ProductChapterRedirect(): ReactElement {
  const { product } = useParams();
  const chapter = CHAPTERS.find(name => name === product);
  return <Navigate to={chapter ? `/product#${chapter}` : "/product"} replace />;
}
