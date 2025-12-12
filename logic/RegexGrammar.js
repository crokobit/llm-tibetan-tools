export default class RegexGrammar {
    // Matches the entire block: >>> Raw Text >>>> Analysis >>>>>
    static BLOCK = />>>\s*([\s\S]*?)\s*>>>>\s*([\s\S]*?)\s*>>>>>/g;

    // Matches a single analysis line: tabs, <original>, [analysis]
    // Captures: 1=tabs, 2=original, 3=analysis_content
    static ANALYSIS_LINE = /^(\t*)<([^>]+)>\[(.*)\]\s*$/;

    // Matches the internal analysis content: A{B1,Bh, B2}C D
    // A = volls (optional), { ... } = pos/tense, C D = root/definition
    static ANALYSIS_CONTENT = /^(.*?){([^}]+)}(.*)$/i;
}
