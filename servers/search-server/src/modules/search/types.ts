export interface WebSearchResultDto {
  position?: number;
  title?: string;
  snippet?: string;
  url: string;
  displayUrl?: string;
  source?: string;
  favicon?: string;
  thumbnail?: string;
}

export interface WebSearchResponseData {
  query: string;
  provider: "terqivo";
  page: number;
  results: WebSearchResultDto[];
}

export interface WebSearchProvider {
  readonly name: "terqivo";
  search(query: string, page: number): Promise<Pick<WebSearchResponseData, "results">>;
}
