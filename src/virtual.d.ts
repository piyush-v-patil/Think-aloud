declare module 'virtual:problem-index' {
  const index: { id: string; title: string; difficulty: 'easy' | 'medium' | 'hard'; topics: string[]; mentions: string[] }[];
  export default index;
}
