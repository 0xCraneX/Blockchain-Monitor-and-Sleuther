import { Account, GraphData } from '../model/ftd-model';

class API {
    private readonly host: string;
    private readonly port: number;

    constructor(host: string, port: number) {
        this.host = host;
        this.port = port;
    }

    private getBasePath(): string {
        return 'https://' + this.host + ':' + this.port;
    }

    private bigintReviver(key: string, value: any): any {
        if (key === 'volume' || key === 'free' || key === 'reserved' || key === 'frozen') {
            return BigInt(value);
        }
        return value;
    }

    async searchAccount(query: string): Promise<Account[]> {
        return await (
            await fetch(
                this.getBasePath() + '/account?' + new URLSearchParams({ query: query }).toString(),
                {
                    method: 'GET',
                    headers: {},
                },
            )
        ).json();
    }

    async getAccountGraph(address: string, depth: number = 1, maxNodes?: number): Promise<GraphData> {
        const params = new URLSearchParams({
            depth: depth.toString(),
            ...(maxNodes && { maxNodes: maxNodes.toString() })
        });
        
        const jsonString = await (
            await fetch(`${this.getBasePath()}/account/${address}/graph?${params.toString()}`, {
                method: 'GET',
                headers: {},
            })
        ).text();
        return JSON.parse(jsonString, this.bigintReviver);
    }
    
    async getAccountNeighbors(
        address: string, 
        direction: 'incoming' | 'outgoing' | 'both' = 'both', 
        limit: number = 50,
        minVolume?: bigint,
        sortBy: 'volume' | 'count' | 'recent' = 'volume'
    ): Promise<GraphData> {
        const params = new URLSearchParams({
            direction,
            limit: limit.toString(),
            sortBy,
            ...(minVolume && { minVolume: minVolume.toString() })
        });
        
        const jsonString = await (
            await fetch(`${this.getBasePath()}/account/${address}/neighbors?${params.toString()}`, {
                method: 'GET',
                headers: {},
            })
        ).text();
        return JSON.parse(jsonString, this.bigintReviver);
    }
    
    async getNetworkPath(
        fromAddress: string, 
        toAddress: string, 
        maxHops: number = 5,
        algorithm: 'shortest' | 'highest_volume' | 'most_recent' = 'shortest'
    ): Promise<{
        path: string[];
        totalVolume: bigint;
        hopCount: number;
        pathFound: boolean;
    }> {
        const params = new URLSearchParams({
            from: fromAddress,
            to: toAddress,
            maxHops: maxHops.toString(),
            algorithm
        });
        
        const jsonString = await (
            await fetch(`${this.getBasePath()}/network/path?${params.toString()}`, {
                method: 'GET',
                headers: {},
            })
        ).text();
        return JSON.parse(jsonString, this.bigintReviver);
    }
    
    async getNetworkCluster(
        centerAddress: string,
        radius: number = 2,
        minConnections: number = 2,
        algorithm: 'density' | 'volume' | 'mixed' = 'mixed'
    ): Promise<GraphData> {
        const params = new URLSearchParams({
            center: centerAddress,
            radius: radius.toString(),
            minConnections: minConnections.toString(),
            algorithm
        });
        
        const jsonString = await (
            await fetch(`${this.getBasePath()}/network/cluster?${params.toString()}`, {
                method: 'GET',
                headers: {},
            })
        ).text();
        return JSON.parse(jsonString, this.bigintReviver);
    }
    
    async getProgressiveNeighbors(
        addresses: string[],
        batchSize: number = 10,
        offset: number = 0
    ): Promise<{
        data: GraphData;
        hasMore: boolean;
        nextOffset: number;
        totalAvailable: number;
    }> {
        const params = new URLSearchParams({
            addresses: addresses.join(','),
            batchSize: batchSize.toString(),
            offset: offset.toString()
        });
        
        const jsonString = await (
            await fetch(`${this.getBasePath()}/network/progressive?${params.toString()}`, {
                method: 'GET',
                headers: {},
            })
        ).text();
        return JSON.parse(jsonString, this.bigintReviver);
    }
}

export { API };
