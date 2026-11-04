import { fold } from './domain.ts';
import type { SearchResult } from './types';
export type SearchMode = 'phrase' | 'all' | 'any' | 'boolean';
export interface SearchOptions { mode: SearchMode; bookId: string; testament: '' | 'old' | 'new'; exclude: string }
export const defaultSearchOptions: SearchOptions = {mode:'phrase',bookId:'',testament:'',exclude:''};
type Predicate = (text: string, words: Set<string>) => boolean;
const wordList = (text: string) => fold(text).match(/[\p{L}\p{N}]+/gu) || [];
function term(raw: string): Predicate {
  const value = fold(raw.replace(/^"|"$/g,''));
  if (!value) throw new Error('Enter a nonempty search term.');
  return /\s/u.test(value) || raw.startsWith('"') ? text => text.includes(value) : (_text,words) => words.has(value);
}
export function compileSearch(query: string, mode: SearchMode): Predicate {
  if (!query.trim() || query.length > 500) throw new Error('Enter a search between 1 and 500 characters.');
  if (mode === 'phrase') { const value=fold(query); return text => text.includes(value); }
  if (mode === 'all' || mode === 'any') {
    const terms=wordList(query); if(!terms.length)throw new Error('Enter at least one word.');
    return (_text,words) => mode==='all' ? terms.every(word=>words.has(word)) : terms.some(word=>words.has(word));
  }
  if (mode !== 'boolean') throw new Error('Unsupported search mode.');
  const tokens=query.match(/"[^"\n]+"|\(|\)|[^\s()"]+/gu)||[];
  if(tokens.join('').replace(/\s/g,'')!==query.replace(/\s/g,''))throw new Error('Check the quotation marks in this search.');
  if(tokens.length>100)throw new Error('Use at most 100 search terms and operators.');
  let cursor=0,depth=0;
  const unary = ():Predicate => {
    if(++depth>32)throw new Error('This search has too many nested expressions.');
    const token=tokens[cursor++]; let expression:Predicate;
    if(token==='NOT'){const inner=unary();expression=(text,words)=>!inner(text,words);}
    else if(token==='('){expression=or();if(tokens[cursor++]!==')')throw new Error('Close each search parenthesis.');}
    else if(!token||['AND','OR',')'].includes(token))throw new Error('Add a term after each search operator.');
    else expression=term(token);
    depth--;return expression;
  };
  const and=():Predicate=>{let left=unary();while(tokens[cursor]==='AND'){cursor++;const previous=left,right=unary();left=(text,words)=>previous(text,words)&&right(text,words);}return left;};
  const or=():Predicate=>{let left=and();while(tokens[cursor]==='OR'){cursor++;const previous=left,right=and();left=(text,words)=>previous(text,words)||right(text,words);}return left;};
  const expression=or();if(cursor!==tokens.length)throw new Error('Separate Boolean terms with AND or OR. Use NOT to exclude a term.');return expression;
}
export function searchRows(rows: SearchResult[], query: string, options: SearchOptions, bookIds: string[]): SearchResult[] {
  const predicate=compileSearch(query,options.mode), excluded=wordList(options.exclude), boundary=bookIds.indexOf('MAT');
  if(options.bookId && !bookIds.includes(options.bookId))throw new Error('That book is absent from this search edition.');
  return rows.filter(row=>{
    const index=bookIds.indexOf(row.bookId);
    if(index<0 || (options.bookId && row.bookId!==options.bookId))return false;
    if(options.testament && boundary<0)throw new Error('This edition has no verified testament boundary.');
    if(options.testament==='old'&&index>=boundary || options.testament==='new'&&index<boundary)return false;
    const text=fold(row.text),words=new Set(wordList(row.text));
    return !excluded.some(word=>words.has(word)) && predicate(text,words);
  });
}
