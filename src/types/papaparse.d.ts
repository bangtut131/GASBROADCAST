declare module 'papaparse' {
    interface ParseConfig<T = any> {
        header?: boolean;
        skipEmptyLines?: boolean | 'greedy';
        delimiter?: string;
        complete?: (results: ParseResult<T>) => void;
        error?: (error: any) => void;
        [key: string]: any;
    }

    interface ParseResult<T = any> {
        data: T[];
        errors: any[];
        meta: {
            delimiter: string;
            linebreak: string;
            aborted: boolean;
            truncated: boolean;
            fields?: string[];
        };
    }

    interface Papa {
        parse<T = any>(input: string | File, config?: ParseConfig<T>): ParseResult<T> | void;
        unparse(data: any, config?: any): string;
    }

    const papa: Papa;
    export default papa;
}
