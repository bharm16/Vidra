import { searchArticles, type DocArticle } from "./articles";

/** Search code is requested only when its overlay opens and can be retried independently. */
export function searchDocIndex(query: string): DocArticle[] {
  return searchArticles(query);
}
