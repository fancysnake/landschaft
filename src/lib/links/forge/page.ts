/** Where a GraphQL connection's page ends. */
export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
