const explicitWebSearchPattern =
  /\b(search the web|search google|google search|look online|on the internet|online search)\b/i;
const freshInformationPattern =
  /\b(latest|current|today|tonight|now|recent|recently|news|weather|forecast|price|prices|stock|stocks|score|scores|version|release|who is the current)\b/i;

export function shouldUseGoogleSearch(query: string): boolean {
  return (
    explicitWebSearchPattern.test(query) || freshInformationPattern.test(query)
  );
}
