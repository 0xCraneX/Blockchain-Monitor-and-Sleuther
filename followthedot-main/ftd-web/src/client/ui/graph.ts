import * as d3 from 'd3';
import { BaseType, Simulation, SimulationNodeDatum } from 'd3';
import {
    Account,
    getAccountConfirmedIcon,
    getAccountDisplay,
    getAccountSubscanDisplay,
    GraphData,
    TransferVolume,
    ProgressiveLoadingState,
    NetworkAnalysis,
} from '../model/ftd-model';
import { formatNumber, truncateAddress } from '../util/format';
import { Polkadot } from '../util/constants';
import { polkadotIcon } from '@polkadot/ui-shared';

const LINK_DISTANCE = 400;
const LINK_ARROW_SIZE = 10;
const LINK_SEPARATION_OFFSET = 12;
const ACCOUNT_RADIUS = 90;
const BALANCE_DENOMINATOR = BigInt(10_000_000);

type SVG_SVG_SELECTION = d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
type SVG_BASE_SELECTION = d3.Selection<BaseType, unknown, SVGGElement, any>;
type SVG_GROUP_SELECTION = d3.Selection<SVGGElement, unknown, HTMLElement, any>;
type SVG_TEXT_SELECTION = d3.Selection<BaseType | SVGTextElement, unknown, SVGGElement, any>;
type SVG_SIMULATION = Simulation<SimulationNodeDatum, undefined>;

enum LinkPosition {
    Left,
    Middle,
    Right,
}

let balanceStrokeScale: d3.ScaleLinear<number, number>;
let balanceColorScale: d3.ScaleLinear<string, string>;
let balanceOpacityScale: d3.ScaleLinear<number, number>;

let transferStrokeScale: d3.ScaleLinear<number, number>;
let transferColorScale: d3.ScaleLinear<string, string>;
let transferOpacityScale: d3.ScaleLinear<number, number>;

function getIdenticon(address: string): string {
    const circles = polkadotIcon(address, { isAlternative: false })
        .map(
            ({ cx, cy, fill, r }) =>
                `<circle class="identicon" cx=${cx} cy=${cy} fill="${fill}" r=${r} />`,
        )
        .join('');
    return `${circles}`;
}

function appendSVG(): SVG_SVG_SELECTION {
    const width = window.innerWidth;
    const height = window.innerHeight;
    return d3
        .select('.graph-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [-width / 2, -height / 2, width, height])
        .attr('style', 'max-width: 100%; max-height: 100%;');
}

function appendSVGMarkerDefs(svg: SVG_SVG_SELECTION) {
    svg.append('defs')
        .selectAll('marker')
        .data(['transfer'])
        .enter()
        .append('marker')
        .attr('id', (d) => d)
        .attr('markerWidth', LINK_ARROW_SIZE)
        .attr('markerHeight', LINK_ARROW_SIZE)
        .attr('refX', ACCOUNT_RADIUS + LINK_ARROW_SIZE)
        .attr('refY', LINK_ARROW_SIZE / 2)
        .attr('orient', 'auto')
        .attr('markerUnits', 'userSpaceOnUse')
        .append('path')
        .attr('d', `M0,0L0,${LINK_ARROW_SIZE}L${LINK_ARROW_SIZE},${LINK_ARROW_SIZE / 2}z`);
}

function transformAccountLabel(d: any, scale: number): string {
    const groupSelector = `#account-label-${d.address}`;
    const group = d3.select(groupSelector);
    // @ts-ignore
    const groupWidth = group.node()!.getBoundingClientRect().width;

    let balanceLabelYOffset = 24;
    const subscanDisplayLabelSelector = `#account-subscan-display-label-${d.address}`;
    const subscanDisplayLabel = d3.select(subscanDisplayLabelSelector);
    // @ts-ignore
    const subscanDisplayLabelWidth = subscanDisplayLabel.node()!.getBoundingClientRect().width;
    const merkleScienceIconSelector = `#account-merkle-science-icon-${d.address}`;
    const merkleScienceIcon = d3.select(merkleScienceIconSelector);
    // @ts-ignore
    let merkleScienceIconWidth = merkleScienceIcon.node()!.getBoundingClientRect().width;
    if (!d.subscanAccount?.accountDisplay?.merkle) {
        merkleScienceIconWidth = 0;
    }
    if (subscanDisplayLabelWidth > 0) {
        balanceLabelYOffset = 46;
        if (merkleScienceIconWidth > 0) {
            merkleScienceIcon.attr('opacity', 1.0);
        } else {
            merkleScienceIcon.attr('opacity', 0.0);
        }
    } else {
        merkleScienceIcon.attr('opacity', 0.0);
    }
    subscanDisplayLabel.attr(
        'transform',
        `translate(${(groupWidth - subscanDisplayLabelWidth + merkleScienceIconWidth) / scale / 2}, 24)`,
    );
    merkleScienceIcon.attr(
        'transform',
        `translate(${(groupWidth - subscanDisplayLabelWidth - merkleScienceIconWidth - 4) / scale / 2}, 0)`,
    );

    // set balance label position
    const balanceLabelSelector = `#account-balance-label-${d.address}`;
    const balanceLabel = d3.select(balanceLabelSelector);
    // @ts-ignore
    const balanceLabelWidth = balanceLabel.node()!.getBoundingClientRect().width;
    balanceLabel.attr(
        'transform',
        `translate(${(groupWidth - balanceLabelWidth) / scale / 2}, ${balanceLabelYOffset})`,
    );

    // set identicon position & size
    const identiconSelector = `#account-identicon-${d.address}`;
    const identicon = d3.select(identiconSelector);
    if (!identicon) {
        return 'translate(0,0)';
    }
    // @ts-ignore
    const identiconWidth = identicon.node()!.getBoundingClientRect().width;
    const x = (groupWidth - identiconWidth) / 2 / scale;
    identicon.attr('transform', `translate(${x}, -46) scale(0.4, 0.4)`);

    /*
    const LABEL_FORCE_PADDING = ACCOUNT_RADIUS + 10;
    const width = window.innerWidth;
    const height = window.innerHeight;
    d.x = d.x <= LABEL_FORCE_PADDING ? LABEL_FORCE_PADDING : d.x >= width - LABEL_FORCE_PADDING ? width - LABEL_FORCE_PADDING : d.x;
    d.y = d.y <= LABEL_FORCE_PADDING ? LABEL_FORCE_PADDING : d.y >= height - LABEL_FORCE_PADDING ? height - LABEL_FORCE_PADDING : d.y;
     */
    return 'translate(' + (d.x - groupWidth / scale / 2) + ',' + d.y + ')';
}

function getAccountStrokeWidth(account: Account): number {
    let balance = BigInt('0');
    if (account.balance) {
        balance = account.balance.free;
    }
    return balanceStrokeScale(Number((balance / BALANCE_DENOMINATOR).valueOf()));
}

function getAccountStrokeColor(account: Account): string {
    let balance = BigInt('0');
    if (account.balance) {
        balance = account.balance.free;
    }
    return balanceColorScale(Number((balance / BALANCE_DENOMINATOR).valueOf()));
}

function getAccountStrokeOpacity(account: Account): number {
    let balance = BigInt('0');
    if (account.balance) {
        balance = account.balance.free;
    }
    return balanceOpacityScale(Number((balance / BALANCE_DENOMINATOR).valueOf()));
}

function getTransferStrokeWidth(transfer: TransferVolume): number {
    return transferStrokeScale(Number((transfer.volume / BALANCE_DENOMINATOR).valueOf()));
}

function getTransferStrokeColor(transfer: TransferVolume): string {
    return transferColorScale(Number((transfer.volume / BALANCE_DENOMINATOR).valueOf()));
}

function getTransferStrokeOpacity(transfer: TransferVolume): number {
    return transferOpacityScale(Number((transfer.volume / BALANCE_DENOMINATOR).valueOf()));
}

class Graph {
    private readonly svg: SVG_SVG_SELECTION;
    private accountGroup: SVG_GROUP_SELECTION;
    private transferGroup: SVG_GROUP_SELECTION;
    private simulation: SVG_SIMULATION;
    private scale = 1;
    private accounts: any[] = [];
    private transferVolumes: any[] = [];
    private readonly onClickAccount: (address: string, depth?: number, priority?: boolean) => void;
    private readonly onDoubleClickAccount: (address: string) => void;
    private readonly drag = d3
        .drag()
        .on('start', (event) => {
            if (!event.active) this.simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        })
        .on('drag', (event) => {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        })
        .on('end', (event) => {
            if (!event.active) this.simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        });
    private readonly zoom = d3
        .zoom()
        .extent([
            [0, 0],
            [window.innerWidth, window.innerHeight],
        ])
        .scaleExtent([0.2, 8])
        .on('zoom', (e) => {
            this.scale = e.transform.k;
            this.transferGroup.attr('transform', e.transform);
            this.accountGroup.attr('transform', e.transform);
        });
    private readonly initialScale;
    private readonly initialTransform;
    private loadedAddresses: string[] = [];
    private expandingAddresses: Set<string> = new Set();
    private expansionHistory: { address: string; timestamp: number; depth: number }[] = [];
    private maxExpansionDepth: number = 3;
    private maxNodesPerExpansion: number = 50;
    private expansionStrategy: 'importance' | 'volume' | 'risk' | 'balanced' = 'balanced';
    private performanceMode: 'fast' | 'balanced' | 'detailed' = 'balanced';
    private currentExpansionDepth: Map<string, number> = new Map();
    private nodeImportanceScores: Map<string, number> = new Map();
    private expansionQueue: { address: string; priority: number; depth: number }[] = [];
    private performanceMetrics: {
        averageExpansionTime: number;
        totalNodes: number;
        expansionCount: number;
    } = { averageExpansionTime: 0, totalNodes: 0, expansionCount: 0 };
    private progressiveLoadingState: ProgressiveLoadingState = {
        isLoading: false,
        hasMore: false,
        currentOffset: 0,
        batchSize: 20,
        totalAvailable: 0,
        loadedBatches: 0
    };
    private clickTimeout?: NodeJS.Timeout = undefined;
    private currentLayoutAlgorithm: 'force' | 'circular' | 'hierarchical' | 'grid' = 'force';
    private isSimulationPaused: boolean = false;
    private arePositionsLocked: boolean = false;
    private layoutTransitionDuration: number = 800;

    constructor(
        onClickAccount: (address: string, depth?: number, priority?: boolean) => void,
        onDoubleClickAccount: (address: string) => void,
    ) {
        if (window.innerWidth < 600) {
            this.initialScale = 0.5;
        } else {
            this.initialScale = 0.7;
        }
        this.initialTransform = d3.zoomIdentity.scale(this.initialScale);
        this.onClickAccount = onClickAccount;
        this.onDoubleClickAccount = onDoubleClickAccount;
        this.svg = appendSVG();
        this.transferGroup = this.svg.append('g');
        this.accountGroup = this.svg.append('g');
        this.simulation = d3
            .forceSimulation()
            .force(
                'link',
                d3
                    .forceLink()
                    // @ts-ignore
                    .id((d) => d.address)
                    .strength(0.8)
                    .distance(LINK_DISTANCE),
            )
            .force('charge', d3.forceManyBody().strength(-5000))
            .force('x', d3.forceX(0))
            .force('y', d3.forceY(0));
        appendSVGMarkerDefs(this.svg);
        this.svg
            // @ts-ignore
            .call(this.zoom)
            .on('dblclick.zoom', null);
        // @ts-ignore
        this.svg.call(this.zoom.transform, this.initialTransform);
    }

    private getLinkTranslation(linkPosition: LinkPosition, point0: any, point1: any) {
        const x1_x0 = point1.x - point0.x,
            y1_y0 = point1.y - point0.y;
        let targetDistance = 0;
        switch (linkPosition) {
            case LinkPosition.Left:
                targetDistance = -1 * LINK_SEPARATION_OFFSET;
                break;
            case LinkPosition.Right:
                targetDistance = LINK_SEPARATION_OFFSET;
                break;
        }
        let x2_x0, y2_y0;
        if (y1_y0 === 0) {
            x2_x0 = 0;
            y2_y0 = targetDistance;
        } else {
            const angle = Math.atan(x1_x0 / y1_y0);
            x2_x0 = -targetDistance * Math.cos(angle);
            y2_y0 = targetDistance * Math.sin(angle);
        }
        return {
            dx: x2_x0,
            dy: y2_y0,
        };
    }

    private tick(
        accounts: SVG_BASE_SELECTION,
        transfers: SVG_TEXT_SELECTION,
        transferLabels: SVG_BASE_SELECTION,
    ) {
        accounts
            .select('circle.account')
            .attr('cx', (d: any) => d.x)
            .attr('cy', (d: any) => d.y);
        accounts
            .select('g.account-label')
            .attr('transform', (d: any) => transformAccountLabel(d, this.scale));
        transfers
            .attr('d', (d: any) => `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`)
            .attr('transform', (d: any) => {
                const translation = this.getLinkTranslation(d.linkPosition, d.source, d.target);
                d.offsetX = translation.dx;
                d.offsetY = translation.dy;
                return `translate (${d.offsetX}, ${d.offsetY})`;
            });
        transferLabels.attr('transform', (d: any) => {
            if (d.target.x < d.source.x) {
                return (
                    'rotate(180,' +
                    ((d.source.x + d.target.x) / 2 + d.offsetX) +
                    ',' +
                    ((d.source.y + d.target.y) / 2 + d.offsetY) +
                    ')'
                );
            } else {
                return 'rotate(0)';
            }
        });
    }

    private resetTransferVolumeLinkPositions() {
        for (let i = 0; i < this.transferVolumes.length; i++) {
            this.transferVolumes[i].linkPosition = LinkPosition.Middle;
        }
        for (let i = 0; i < this.transferVolumes.length; i++) {
            if (this.transferVolumes[i].linkPosition === LinkPosition.Left) continue;
            this.transferVolumes[i].linkPosition = LinkPosition.Middle;
            for (let j = i + 1; j < this.transferVolumes.length; j++) {
                if (this.transferVolumes[j].linkPosition === LinkPosition.Left) continue;
                if (
                    this.transferVolumes[i].target === this.transferVolumes[j].source &&
                    this.transferVolumes[i].source === this.transferVolumes[j].target
                ) {
                    this.transferVolumes[i].linkPosition = LinkPosition.Right;
                    this.transferVolumes[j].linkPosition = LinkPosition.Left;
                }
            }
        }
    }

    private resetScales() {
        const maxBalance = this.accounts.reduce((acc, account) => {
            let balance = BigInt('0');
            if (account.balance) {
                balance = account.balance.free / BALANCE_DENOMINATOR;
            }
            return acc > balance ? acc : balance;
        }, 0);
        balanceStrokeScale = d3.scaleLinear([0n, maxBalance].map(Number), [1, 10]);
        balanceColorScale = d3.scaleLinear([0n, maxBalance].map(Number), ['gray', 'blue']);
        balanceOpacityScale = d3.scaleLinear([0n, maxBalance].map(Number), [0.75, 0.4]);
        const maxTransferVolume = this.transferVolumes.reduce((acc, transferVolume) => {
            const volume = transferVolume.volume / BALANCE_DENOMINATOR;
            return acc > volume ? acc : volume;
        }, 0);
        transferStrokeScale = d3.scaleLinear([0n, maxTransferVolume].map(Number), [0.5, 5]);
        transferColorScale = d3.scaleLinear([0n, maxTransferVolume].map(Number), ['gray', 'red']);
        transferOpacityScale = d3.scaleLinear([0n, maxTransferVolume].map(Number), [1.0, 0.5]);
    }

    reset() {
        this.loadedAddresses = [];
        this.expandingAddresses.clear();
        this.expansionHistory = [];
        this.currentExpansionDepth.clear();
        this.nodeImportanceScores.clear();
        this.expansionQueue = [];
        this.stopAutoExpansion();
        this.accounts = [];
        this.transferVolumes = [];
        const transform = d3.zoomIdentity.translate(0, 0).scale(this.initialScale);
        // @ts-ignore
        this.svg.call(this.zoom.transform, transform);
        this.display();
    }

    removeAccount(address: string) {
        this.accounts = this.accounts.filter((a) => a.address != address);
        this.transferVolumes = this.transferVolumes.filter(
            (t) => t.source.address != address && t.target.address != address,
        );
        this.resetTransferVolumeLinkPositions();
        this.resetScales();
        this.display();
    }

    appendData(forAddress: string, data: GraphData, depth: number = 1) {
        if (!this.loadedAddresses.includes(forAddress)) {
            this.loadedAddresses.push(forAddress);
        }
        this.currentExpansionDepth.set(forAddress, depth);
        const startTime = Date.now();
        this.expansionHistory.push({ address: forAddress, timestamp: startTime, depth });
        this.expandingAddresses.delete(forAddress);
        this.removeExpandingIndicators(forAddress);
        
        // Add expansion success animation
        this.addExpansionSuccessAnimation(forAddress, data.accounts.length);
        
        // Update performance metrics
        const expansionTime = Date.now() - startTime;
        this.updatePerformanceMetrics(expansionTime, data.accounts.length);
        
        // Update progressive loading state if metadata is available
        if (data.metadata) {
            this.progressiveLoadingState.hasMore = data.metadata.hasMore || false;
            this.progressiveLoadingState.currentOffset = data.metadata.nextOffset || 0;
            this.progressiveLoadingState.totalAvailable = data.metadata.totalNodes || this.accounts.length;
        }
        
        for (const account of data.accounts) {
            if (this.accounts.findIndex((a) => a.address === account.address) === -1) {
                this.accounts.push({ ...account });
            }
        }
        for (const transfer of data.transferVolumes) {
            if (this.transferVolumes.findIndex((t) => t.id === transfer.id) === -1) {
                // check that all accounts exist
                const fromIndex = this.accounts.findIndex((a) => transfer.from === a.address);
                const toIndex = this.accounts.findIndex((a) => transfer.to === a.address);
                if (fromIndex >= 0 && toIndex >= 0) {
                    this.transferVolumes.push({
                        id: transfer.id,
                        source: transfer.from,
                        target: transfer.to,
                        count: transfer.count,
                        volume: transfer.volume,
                    });
                } else {
                    if (fromIndex < 0) {
                        console.error(
                            `Transfer #${transfer.id} sender account ${transfer.from} not found.`,
                        );
                    }
                    if (toIndex < 0) {
                        console.error(
                            `Transfer #${transfer.id} receipient account ${transfer.to} not found.`,
                        );
                    }
                }
            }
        }
        this.resetTransferVolumeLinkPositions();
        this.resetScales();
        this.display();
        
        // Animate new nodes appearance
        this.animateNewNodes(data.accounts.filter(account => 
            this.accounts.findIndex(a => a.address === account.address) !== -1
        ));
    }

    private displayTransfers(): SVG_BASE_SELECTION {
        return this.transferGroup
            .selectAll('path.transfer')
            .data(this.transferVolumes, (d: any) => d.id)
            .join('path')
            .attr('id', (d) => `link-${d.id}`)
            .attr('class', 'transfer')
            .attr('stroke', (transfer: TransferVolume) => getTransferStrokeColor(transfer))
            .attr('stroke-width', (transfer: TransferVolume) => getTransferStrokeWidth(transfer))
            .attr('stroke-opacity', (transfer: TransferVolume) =>
                getTransferStrokeOpacity(transfer),
            )
            .attr('marker-end', 'url(#transfer)');
    }

    private displayTransferLabels(): SVG_BASE_SELECTION {
        return this.transferGroup
            .selectAll('text.transfer-label')
            .data(this.transferVolumes, (d: any) => d.id)
            .join(
                (enter) => {
                    const transferLabels = enter
                        .append('text')
                        .attr('class', 'transfer-label')
                        .attr('text-anchor', 'middle')
                        //.attr('dy', '0.31em');
                        .attr('dy', '-0.25em');
                    transferLabels
                        .append('textPath')
                        .attr('href', (d) => `#link-${d.id}`)
                        .attr('startOffset', '50%')
                        .text(
                            (d) =>
                                d.count +
                                ' ⇆ ' +
                                formatNumber(d.volume, Polkadot.DECIMAL_COUNT, 2, 'DOT'),
                        )
                        //.style('pointer-events', 'none')
                        .on('mouseover', function () {
                            d3.select(this).attr('cursor', 'pointer');
                        })
                        .on('mouseout', function () {});
                    return transferLabels;
                },
                undefined,
                (exit) => exit.remove(),
            );
    }

    private displayAccounts(): SVG_BASE_SELECTION {
        return this.accountGroup
            .selectAll('g.account')
            .data(this.accounts, (d: any) => d.address)
            .join(
                (enter) => {
                    const accountGroup = enter.append('g')
                        .attr('class', 'account')
                        .attr('data-address', (d: any) => d.address);
                    accountGroup.append('title').text((d) => truncateAddress(d.address));
                    // @ts-ignore
                    accountGroup.call(this.drag);
                    accountGroup
                        .append('circle')
                        .attr('id', (d) => `account-${d.address}`)
                        .attr('class', 'account')
                        //.attr('fill', '#DDD')
                        .attr('fill', '#FFF')
                        .attr('stroke', (account: Account) => getAccountStrokeColor(account))
                        .attr('stroke-width', (account: Account) => getAccountStrokeWidth(account))
                        .attr('stroke-opacity', (account: Account) =>
                            getAccountStrokeOpacity(account),
                        )
                        .attr('r', ACCOUNT_RADIUS)
                        .on('mouseover', (e, d) => {
                            let cursor = 'cell';
                            let fillColor = '#EFEFEF';
                            
                            if (this.expandingAddresses.has(d.address)) {
                                cursor = 'progress';
                                fillColor = '#FFE4B5';
                            } else if (this.loadedAddresses.indexOf(d.address) >= 0) {
                                cursor = 'all-scroll';
                                fillColor = '#E6F3FF';
                            }
                            
                            d3.select(`#account-${d.address}`).attr('fill', fillColor);
                            d3.select(`#account-${d.address}`).attr('cursor', cursor);
                        })
                        .on('mouseout', function () {
                            /*function (e, d) {*/
                            d3.select(this).attr('fill', '#FFF');
                        })
                        .on('click', (e, d) => {
                            const canExpand = this.canExpandNode(d.address);
                            if (canExpand && !this.expandingAddresses.has(d.address)) {
                                this.markNodeAsExpanding(d.address);
                                clearTimeout(this.clickTimeout);
                                this.clickTimeout = setTimeout(() => {
                                    const nextDepth = (this.currentExpansionDepth.get(d.address) || 0) + 1;
                                    const priority = this.shouldPrioritizeExpansion(d.address);
                                    this.onClickAccount(d.address, nextDepth, priority);
                                }, 200);
                            }
                        })
                        .on('dblclick', (e, d) => {
                            clearTimeout(this.clickTimeout);
                            this.onDoubleClickAccount(d.address);
                        });

                    const accountLabel = accountGroup
                        .append('g')
                        .attr('id', (account: Account) => `account-label-${account.address}`)
                        .attr('class', 'account-label');
                    accountLabel
                        .append('svg:image')
                        .attr(
                            'xlink:href',
                            (account: Account) => getAccountConfirmedIcon(account) ?? '',
                        )
                        // .attr('x', -44)
                        .attr('class', 'identity-icon')
                        .attr('y', -7)
                        .attr('opacity', (account: Account) =>
                            getAccountConfirmedIcon(account) ? 1.0 : 0,
                        );
                    accountLabel
                        .append('text')
                        .attr('class', 'account-display-label')
                        .attr('x', (account: Account) =>
                            getAccountConfirmedIcon(account) ? '18px' : '0',
                        )
                        .attr('y', '.31em')
                        //.attr('text-anchor', 'middle')
                        .text((account: Account) => getAccountDisplay(account))
                        .style('pointer-events', 'none');
                    accountLabel
                        .append('text')
                        .attr(
                            'id',
                            (account: Account) => `account-balance-label-${account.address}`,
                        )
                        .attr('class', 'account-balance-label')
                        //.attr('text-anchor', 'middle')
                        .text((account: Account) => {
                            let balance = BigInt('0');
                            if (account.balance) {
                                balance = account.balance.free;
                            }
                            return formatNumber(balance, Polkadot.DECIMAL_COUNT, 2, 'DOT');
                        })
                        .style('pointer-events', 'none');
                    accountLabel
                        .append('svg:image')
                        .attr('xlink:href', './img/icon/merkle-science-icon.svg')
                        .attr(
                            'id',
                            (account: Account) => `account-merkle-science-icon-${account.address}`,
                        )
                        .attr('class', 'account-merkle-science-icon')
                        .attr('y', 12)
                        .attr('opacity', 1.0);
                    accountLabel
                        .append('text')
                        .attr(
                            'id',
                            (account: Account) =>
                                `account-subscan-display-label-${account.address}`,
                        )
                        .attr('class', 'account-subscan-display-label')
                        .text((account: Account) => {
                            const display = getAccountDisplay(account);
                            const subscanDisplay = getAccountSubscanDisplay(account);
                            if (subscanDisplay && subscanDisplay != display) {
                                return subscanDisplay;
                            }
                            return '';
                        })
                        .style('pointer-events', 'none');
                    accountLabel
                        .append('g')
                        .attr('id', (d) => `account-identicon-${d.address}`)
                        .html((d) => getIdenticon(d.address))
                        //.style('pointer-events', 'none')
                        .on('mouseover', function () {
                            d3.select(this).attr('cursor', 'pointer');
                        })
                        .on('click', (e, d) => {
                            window.open(
                                `https://polkadot.subscan.io/account/${d.address}`,
                                '_blank',
                            );
                        });
                    // Add expansion state indicator
                    const expansionState = this.getNodeExpansionState(d.address);
                    addExpansionIndicator(accountGroup, expansionState);
                    
                    return accountGroup;
                },
                (update) => {
                    // Update expansion indicators for existing nodes
                    update.each((d: any) => {
                        const expansionState = this.getNodeExpansionState(d.address);
                        const accountGroup = d3.select(`g.account[data-address="${d.address}"]`);
                        if (accountGroup.node()) {
                            addExpansionIndicator(accountGroup, expansionState);
                        }
                    });
                    return update;
                },
                (exit) => exit.remove(),
            );
    }

    private display() {
        // update components
        const transfers = this.displayTransfers();
        const transferLabels = this.displayTransferLabels();
        const accounts = this.displayAccounts();

        // update simulation
        this.simulation.nodes(this.accounts);
        // @ts-ignore
        this.simulation.force('link')!.links(this.transferVolumes);
        this.simulation.on('tick', () => {
            this.tick(accounts, transfers, transferLabels);
        });
        this.simulation.alpha(0.75).restart();
    }

    // Expansion state management methods
    private canExpandNode(address: string): boolean {
        if (this.expandingAddresses.has(address)) {
            return false;
        }
        
        const currentDepth = this.currentExpansionDepth.get(address) || 0;
        if (currentDepth >= this.maxExpansionDepth) {
            return false;
        }
        
        // Check performance limits
        if (this.accounts.length >= this.getMaxNetworkSize()) {
            return false;
        }
        
        return true;
    }
    
    private getMaxNetworkSize(): number {
        switch (this.performanceMode) {
            case 'fast': return 100;
            case 'balanced': return 300;
            case 'detailed': return 1000;
            default: return 300;
        }
    }
    
    private calculateNodeImportance(account: Account): number {
        let score = 0;
        
        // Balance-based importance
        const balanceScore = account.balance ? 
            Number(account.balance.free / BigInt(10_000_000)) / 1000 : 0;
        
        // Identity-based importance
        const identityScore = account.identity?.isConfirmed ? 50 : 
                            account.identity ? 25 : 0;
        
        // Transfer volume importance (calculated from existing transfers)
        const transferScore = this.calculateTransferVolumeScore(account.address);
        
        // Risk-based importance (Merkle Science data)
        const riskScore = account.subscanAccount?.accountDisplay?.merkle ? 100 : 0;
        
        switch (this.expansionStrategy) {
            case 'importance':
                score = identityScore * 0.6 + balanceScore * 0.4;
                break;
            case 'volume':
                score = transferScore * 0.8 + balanceScore * 0.2;
                break;
            case 'risk':
                score = riskScore * 0.9 + identityScore * 0.1;
                break;
            case 'balanced':
            default:
                score = (identityScore + balanceScore + transferScore + riskScore) / 4;
                break;
        }
        
        this.nodeImportanceScores.set(account.address, score);
        return score;
    }
    
    private calculateTransferVolumeScore(address: string): number {
        return this.transferVolumes
            .filter(t => t.source === address || t.target === address)
            .reduce((sum, t) => sum + Number(t.volume / BigInt(10_000_000)), 0) / 1000;
    }
    
    private shouldPrioritizeExpansion(address: string): boolean {
        const account = this.accounts.find(a => a.address === address);
        if (!account) return false;
        
        const importance = this.calculateNodeImportance(account);
        
        // Priority threshold based on strategy
        const threshold = this.expansionStrategy === 'risk' ? 50 :
                         this.expansionStrategy === 'volume' ? 100 :
                         this.expansionStrategy === 'importance' ? 25 : 40;
        
        return importance >= threshold;
    }

    private markNodeAsExpanding(address: string): void {
        this.expandingAddresses.add(address);
        
        // Create expanding animation with ripple effect
        const node = d3.select(`#account-${address}`);
        const accountGroup = d3.select(`g.account[data-address="${address}"]`);
        
        // Add pulsing animation to main node
        node.attr('fill', '#FFE4B5')
            .attr('stroke-dasharray', '5,5')
            .transition()
            .duration(1000)
            .attr('stroke-dashoffset', -10)
            .on('end', function repeat() {
                d3.select(this).transition()
                    .duration(1000)
                    .attr('stroke-dashoffset', -20)
                    .on('end', repeat);
            });
        
        // Add ripple effect
        this.addRippleEffect(accountGroup, address);
        
        // Add loading indicator
        this.addLoadingIndicator(accountGroup, address);
    }
    
    private addRippleEffect(accountGroup: any, address: string): void {
        // Create ripple circles
        for (let i = 0; i < 3; i++) {
            accountGroup.append('circle')
                .attr('class', `ripple-${address}`)
                .attr('r', ACCOUNT_RADIUS)
                .attr('fill', 'none')
                .attr('stroke', '#FF9800')
                .attr('stroke-width', 2)
                .attr('opacity', 0.8)
                .transition()
                .delay(i * 200)
                .duration(1500)
                .attr('r', ACCOUNT_RADIUS * 2.5)
                .attr('opacity', 0)
                .remove();
        }
    }
    
    private addLoadingIndicator(accountGroup: any, address: string): void {
        // Add rotating loading indicator
        const loadingGroup = accountGroup.append('g')
            .attr('class', `loading-indicator-${address}`);
        
        // Create spinning arc
        const arc = d3.arc()
            .innerRadius(ACCOUNT_RADIUS + 5)
            .outerRadius(ACCOUNT_RADIUS + 10)
            .startAngle(0)
            .endAngle(Math.PI);
        
        loadingGroup.append('path')
            .attr('d', arc as any)
            .attr('fill', '#FF9800')
            .attr('opacity', 0.7)
            .transition()
            .duration(1000)
            .attrTween('transform', () => {
                return d3.interpolateString('rotate(0)', 'rotate(360)');
            })
            .on('end', function repeat() {
                d3.select(this).transition()
                    .duration(1000)
                    .attrTween('transform', () => {
                        return d3.interpolateString('rotate(0)', 'rotate(360)');
                    })
                    .on('end', repeat);
            });
    }
    
    private removeExpandingIndicators(address: string): void {
        // Remove ripple effects
        d3.selectAll(`.ripple-${address}`).remove();
        
        // Remove loading indicator
        d3.selectAll(`.loading-indicator-${address}`).remove();
        
        // Reset node appearance
        const node = d3.select(`#account-${address}`);
        node.attr('stroke-dasharray', null)
            .attr('stroke-dashoffset', null)
            .transition()
            .duration(300)
            .attr('fill', '#FFF');
    }

    private getNodeExpansionState(address: string): 'expandable' | 'expanded' | 'expanding' | 'max_depth' {
        if (this.expandingAddresses.has(address)) {
            return 'expanding';
        }
        
        const currentDepth = this.currentExpansionDepth.get(address) || 0;
        if (currentDepth >= this.maxExpansionDepth) {
            return 'max_depth';
        }
        
        if (this.loadedAddresses.includes(address)) {
            return 'expanded';
        }
        
        return 'expandable';
    }

    public setMaxExpansionDepth(depth: number): void {
        this.maxExpansionDepth = Math.max(1, Math.min(10, depth));
    }
    
    public setExpansionStrategy(strategy: 'importance' | 'volume' | 'risk' | 'balanced'): void {
        this.expansionStrategy = strategy;
    }
    
    public setPerformanceMode(mode: 'fast' | 'balanced' | 'detailed'): void {
        this.performanceMode = mode;
        // Adjust performance parameters based on mode
        switch (mode) {
            case 'fast':
                this.maxNodesPerExpansion = 20;
                break;
            case 'balanced':
                this.maxNodesPerExpansion = 50;
                break;
            case 'detailed':
                this.maxNodesPerExpansion = 100;
                break;
        }
    }
    
    public setMaxNodesPerExpansion(maxNodes: number): void {
        this.maxNodesPerExpansion = Math.max(10, Math.min(500, maxNodes));
    }

    public getExpansionHistory(): { address: string; timestamp: number; depth: number }[] {
        return [...this.expansionHistory];
    }

    public clearExpansionHistory(): void {
        this.expansionHistory = [];
        this.expansionQueue = [];
        this.performanceMetrics = { averageExpansionTime: 0, totalNodes: 0, expansionCount: 0 };
        this.progressiveLoadingState = {
            isLoading: false,
            hasMore: false,
            currentOffset: 0,
            batchSize: 20,
            totalAvailable: 0,
            loadedBatches: 0
        };
    }
    
    public getProgressiveLoadingState(): ProgressiveLoadingState {
        return { ...this.progressiveLoadingState };
    }
    
    public setProgressiveLoadingBatchSize(batchSize: number): void {
        this.progressiveLoadingState.batchSize = Math.max(5, Math.min(100, batchSize));
    }
    
    public async loadMoreNodes(): Promise<boolean> {
        if (this.progressiveLoadingState.isLoading || !this.progressiveLoadingState.hasMore) {
            return false;
        }
        
        this.progressiveLoadingState.isLoading = true;
        
        try {
            // Get current leaf nodes (nodes with the fewest connections)
            const leafNodes = this.getLeafNodes();
            
            if (leafNodes.length === 0) {
                return false;
            }
            
            // Load more neighbors for these leaf nodes
            const addresses = leafNodes.slice(0, Math.min(5, leafNodes.length));
            const progressiveData = await this.getProgressiveNeighborsData(addresses);
            
            if (progressiveData && progressiveData.data.accounts.length > 0) {
                this.appendProgressiveData(progressiveData);
                return true;
            }
            
            return false;
        } finally {
            this.progressiveLoadingState.isLoading = false;
        }
    }
    
    private getLeafNodes(): string[] {
        // Find nodes with the fewest connections (potential expansion points)
        const connectionCounts = new Map<string, number>();
        
        this.transferVolumes.forEach(transfer => {
            const sourceCount = connectionCounts.get(transfer.source) || 0;
            const targetCount = connectionCounts.get(transfer.target) || 0;
            connectionCounts.set(transfer.source, sourceCount + 1);
            connectionCounts.set(transfer.target, targetCount + 1);
        });
        
        // Sort by connection count (ascending) and importance score (descending)
        return this.accounts
            .filter(account => !this.loadedAddresses.includes(account.address))
            .sort((a, b) => {
                const connectionsA = connectionCounts.get(a.address) || 0;
                const connectionsB = connectionCounts.get(b.address) || 0;
                
                if (connectionsA !== connectionsB) {
                    return connectionsA - connectionsB; // Fewer connections first
                }
                
                // If same connection count, prioritize by importance
                const importanceA = this.nodeImportanceScores.get(a.address) || 0;
                const importanceB = this.nodeImportanceScores.get(b.address) || 0;
                return importanceB - importanceA;
            })
            .map(account => account.address);
    }
    
    private async getProgressiveNeighborsData(addresses: string[]): Promise<any> {
        // This would call the API's getProgressiveNeighbors method
        // For now, returning a mock structure
        return {
            data: { accounts: [], transferVolumes: [] },
            hasMore: false,
            nextOffset: 0,
            totalAvailable: 0
        };
    }
    
    private appendProgressiveData(progressiveData: any): void {
        const data = progressiveData.data;
        
        // Update progressive loading state
        this.progressiveLoadingState.hasMore = progressiveData.hasMore;
        this.progressiveLoadingState.currentOffset = progressiveData.nextOffset;
        this.progressiveLoadingState.totalAvailable = progressiveData.totalAvailable;
        this.progressiveLoadingState.loadedBatches++;
        
        // Add new accounts
        for (const account of data.accounts) {
            if (this.accounts.findIndex(a => a.address === account.address) === -1) {
                this.accounts.push({ ...account });
            }
        }
        
        // Add new transfers
        for (const transfer of data.transferVolumes) {
            if (this.transferVolumes.findIndex(t => t.id === transfer.id) === -1) {
                const fromIndex = this.accounts.findIndex(a => transfer.from === a.address);
                const toIndex = this.accounts.findIndex(a => transfer.to === a.address);
                if (fromIndex >= 0 && toIndex >= 0) {
                    this.transferVolumes.push({
                        id: transfer.id,
                        source: transfer.from,
                        target: transfer.to,
                        count: transfer.count,
                        volume: transfer.volume,
                    });
                }
            }
        }
        
        this.resetTransferVolumeLinkPositions();
        this.resetScales();
        this.display();
        
        // Animate new nodes
        this.animateNewNodes(data.accounts);
    }
    
    public getPerformanceMetrics(): typeof this.performanceMetrics {
        return { ...this.performanceMetrics };
    }
    
    private updatePerformanceMetrics(expansionTime: number, nodesAdded: number): void {
        this.performanceMetrics.expansionCount++;
        this.performanceMetrics.totalNodes += nodesAdded;
        
        // Update average expansion time with exponential moving average
        const alpha = 0.3;
        this.performanceMetrics.averageExpansionTime = 
            this.performanceMetrics.averageExpansionTime * (1 - alpha) + expansionTime * alpha;
    }
    
    private addToExpansionQueue(address: string, depth: number, priority: number): void {
        // Remove existing entry if present
        this.expansionQueue = this.expansionQueue.filter(item => item.address !== address);
        
        // Add new entry
        this.expansionQueue.push({ address, depth, priority });
        
        // Sort by priority (higher priority first)
        this.expansionQueue.sort((a, b) => b.priority - a.priority);
        
        // Limit queue size based on performance mode
        const maxQueueSize = this.performanceMode === 'fast' ? 10 : 
                           this.performanceMode === 'balanced' ? 25 : 50;
        this.expansionQueue = this.expansionQueue.slice(0, maxQueueSize);
    }
    
    public getExpansionQueue(): typeof this.expansionQueue {
        return [...this.expansionQueue];
    }
    
    public processExpansionQueue(): { address: string; depth: number } | null {
        const nextItem = this.expansionQueue.shift();
        return nextItem ? { address: nextItem.address, depth: nextItem.depth } : null;
    }
    
    public enableAutoExpansion(enabled: boolean): void {
        if (enabled) {
            this.startAutoExpansion();
        } else {
            this.stopAutoExpansion();
        }
    }
    
    private autoExpansionInterval?: NodeJS.Timeout;
    
    private startAutoExpansion(): void {
        if (this.autoExpansionInterval) {
            clearInterval(this.autoExpansionInterval);
        }
        
        const interval = this.performanceMode === 'fast' ? 3000 :
                        this.performanceMode === 'balanced' ? 5000 : 8000;
        
        this.autoExpansionInterval = setInterval(() => {
            this.performAutoExpansion();
        }, interval);
    }
    
    private stopAutoExpansion(): void {
        if (this.autoExpansionInterval) {
            clearInterval(this.autoExpansionInterval);
            this.autoExpansionInterval = undefined;
        }
    }
    
    private performAutoExpansion(): void {
        // Skip if already expanding or network is too large
        if (this.expandingAddresses.size > 0 || this.accounts.length >= this.getMaxNetworkSize()) {
            return;
        }
        
        // Find the most important unexpanded node
        const candidates = this.accounts.filter(account => {
            return this.canExpandNode(account.address) && 
                   !this.loadedAddresses.includes(account.address);
        });
        
        if (candidates.length === 0) {
            return;
        }
        
        // Sort by importance score
        candidates.sort((a, b) => {
            const scoreA = this.nodeImportanceScores.get(a.address) || this.calculateNodeImportance(a);
            const scoreB = this.nodeImportanceScores.get(b.address) || this.calculateNodeImportance(b);
            return scoreB - scoreA;
        });
        
        // Expand the most important node
        const target = candidates[0];
        const nextDepth = (this.currentExpansionDepth.get(target.address) || 0) + 1;
        
        this.markNodeAsExpanding(target.address);
        this.onClickAccount(target.address, nextDepth, true);
    }
    
    private addExpansionSuccessAnimation(address: string, newNodesCount: number): void {
        const accountGroup = d3.select(`g.account[data-address="${address}"]`);
        
        // Success pulse
        accountGroup.append('circle')
            .attr('r', ACCOUNT_RADIUS)
            .attr('fill', 'none')
            .attr('stroke', '#4CAF50')
            .attr('stroke-width', 3)
            .attr('opacity', 1)
            .transition()
            .duration(600)
            .attr('r', ACCOUNT_RADIUS * 1.5)
            .attr('opacity', 0)
            .remove();
        
        // Show count of new nodes discovered
        if (newNodesCount > 0) {
            accountGroup.append('text')
                .attr('class', 'expansion-count')
                .attr('y', -ACCOUNT_RADIUS - 20)
                .attr('text-anchor', 'middle')
                .attr('fill', '#4CAF50')
                .attr('font-size', '12px')
                .attr('font-weight', 'bold')
                .text(`+${newNodesCount}`)
                .attr('opacity', 0)
                .transition()
                .duration(300)
                .attr('opacity', 1)
                .transition()
                .delay(1500)
                .duration(500)
                .attr('opacity', 0)
                .remove();
        }
    }
    
    private animateNewNodes(newAccounts: Account[]): void {
        // Animate new nodes with scale-in effect
        newAccounts.forEach((account, index) => {
            const accountGroup = d3.select(`g.account[data-address="${account.address}"]`);
            
            accountGroup.attr('transform', 'scale(0)')
                .transition()
                .delay(index * 100)
                .duration(500)
                .ease(d3.easeBackOut)
                .attr('transform', 'scale(1)');
        });
    }

    // Layout Control Methods
    public pauseSimulation(): void {
        this.isSimulationPaused = true;
        this.simulation.stop();
        this.addSimulationIndicator('paused');
    }

    public resumeSimulation(): void {
        this.isSimulationPaused = false;
        this.simulation.alpha(0.3).restart();
        this.addSimulationIndicator('running');
    }

    public resetPositions(): void {
        // Reset all node positions and restart simulation
        this.accounts.forEach((node: any) => {
            delete node.x;
            delete node.y;
            delete node.fx;
            delete node.fy;
        });
        
        this.simulation.alpha(1).restart();
        this.addSimulationIndicator('running');
        
        // Add reset animation
        this.addResetAnimation();
    }

    public lockPositions(lock: boolean): void {
        this.arePositionsLocked = lock;
        
        if (lock) {
            // Fix all node positions
            this.accounts.forEach((node: any) => {
                if (node.x !== undefined && node.y !== undefined) {
                    node.fx = node.x;
                    node.fy = node.y;
                }
            });
            this.simulation.stop();
            this.addSimulationIndicator('locked');
        } else {
            // Unfix all node positions
            this.accounts.forEach((node: any) => {
                node.fx = null;
                node.fy = null;
            });
            if (!this.isSimulationPaused) {
                this.simulation.alpha(0.3).restart();
                this.addSimulationIndicator('running');
            }
        }
    }

    public setLayoutAlgorithm(algorithm: 'force' | 'circular' | 'hierarchical' | 'grid'): void {
        this.currentLayoutAlgorithm = algorithm;
        this.applyLayoutAlgorithm(algorithm);
        this.addLayoutIndicator(algorithm);
    }

    private applyLayoutAlgorithm(algorithm: 'force' | 'circular' | 'hierarchical' | 'grid'): void {
        // Add transition class for smooth animations
        this.accountGroup.classed('layout-transition', true);
        
        setTimeout(() => {
            this.accountGroup.classed('layout-transition', false);
        }, this.layoutTransitionDuration);

        switch (algorithm) {
            case 'circular':
                this.applyCircularLayout();
                break;
            case 'hierarchical':
                this.applyHierarchicalLayout();
                break;
            case 'grid':
                this.applyGridLayout();
                break;
            case 'force':
            default:
                this.applyForceLayout();
                break;
        }
    }

    private applyCircularLayout(): void {
        const nodeCount = this.accounts.length;
        const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3;
        const angleStep = (2 * Math.PI) / nodeCount;

        this.accounts.forEach((node: any, index: number) => {
            const angle = index * angleStep;
            const targetX = radius * Math.cos(angle);
            const targetY = radius * Math.sin(angle);
            
            this.animateNodeToPosition(node, targetX, targetY);
        });

        // Stop force simulation for circular layout
        this.simulation.stop();
    }

    private applyHierarchicalLayout(): void {
        // Create a simple hierarchical layout based on node importance/connections
        const levels = this.calculateHierarchicalLevels();
        const levelHeight = 200;
        const levelWidth = window.innerWidth * 0.8;

        levels.forEach((levelNodes, levelIndex) => {
            const nodesInLevel = levelNodes.length;
            const nodeSpacing = levelWidth / (nodesInLevel + 1);
            
            levelNodes.forEach((node: any, nodeIndex: number) => {
                const targetX = (nodeIndex + 1) * nodeSpacing - levelWidth / 2;
                const targetY = levelIndex * levelHeight - (levels.length * levelHeight) / 2;
                
                this.animateNodeToPosition(node, targetX, targetY);
            });
        });

        this.simulation.stop();
    }

    private applyGridLayout(): void {
        const nodeCount = this.accounts.length;
        const cols = Math.ceil(Math.sqrt(nodeCount));
        const rows = Math.ceil(nodeCount / cols);
        const cellWidth = window.innerWidth * 0.8 / cols;
        const cellHeight = window.innerHeight * 0.8 / rows;

        this.accounts.forEach((node: any, index: number) => {
            const col = index % cols;
            const row = Math.floor(index / cols);
            const targetX = (col + 0.5) * cellWidth - (window.innerWidth * 0.8) / 2;
            const targetY = (row + 0.5) * cellHeight - (window.innerHeight * 0.8) / 2;
            
            this.animateNodeToPosition(node, targetX, targetY);
        });

        this.simulation.stop();
    }

    private applyForceLayout(): void {
        // Reset to force-directed layout
        this.accounts.forEach((node: any) => {
            node.fx = null;
            node.fy = null;
        });
        
        this.simulation.alpha(1).restart();
    }

    private calculateHierarchicalLevels(): any[][] {
        // Simple hierarchical leveling based on connections and importance
        const connectionCounts = new Map<string, number>();
        
        this.transferVolumes.forEach(transfer => {
            const sourceCount = connectionCounts.get(transfer.source) || 0;
            const targetCount = connectionCounts.get(transfer.target) || 0;
            connectionCounts.set(transfer.source, sourceCount + 1);
            connectionCounts.set(transfer.target, targetCount + 1);
        });

        // Sort nodes by connection count (descending)
        const sortedNodes = [...this.accounts].sort((a, b) => {
            const connectionsA = connectionCounts.get(a.address) || 0;
            const connectionsB = connectionCounts.get(b.address) || 0;
            return connectionsB - connectionsA;
        });

        // Distribute into levels
        const levels: any[][] = [];
        const maxLevels = Math.min(5, Math.ceil(Math.sqrt(this.accounts.length)));
        const nodesPerLevel = Math.ceil(this.accounts.length / maxLevels);

        for (let i = 0; i < maxLevels; i++) {
            const levelStart = i * nodesPerLevel;
            const levelEnd = Math.min(levelStart + nodesPerLevel, sortedNodes.length);
            levels.push(sortedNodes.slice(levelStart, levelEnd));
        }

        return levels;
    }

    private animateNodeToPosition(node: any, targetX: number, targetY: number): void {
        // Smooth animation to target position
        const startX = node.x || 0;
        const startY = node.y || 0;
        const duration = this.layoutTransitionDuration;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Cubic bezier easing
            const easeProgress = progress < 0.5 
                ? 4 * progress * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            node.x = startX + (targetX - startX) * easeProgress;
            node.y = startY + (targetY - startY) * easeProgress;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                node.x = targetX;
                node.y = targetY;
            }
        };

        requestAnimationFrame(animate);
    }

    // Zoom and Pan Control Methods
    public zoomIn(): void {
        const currentTransform = d3.zoomTransform(this.svg.node()!);
        const newScale = Math.min(currentTransform.k * 1.5, 8);
        const transition = this.svg.transition().duration(300);
        // @ts-ignore
        transition.call(this.zoom.scaleTo, newScale);
    }

    public zoomOut(): void {
        const currentTransform = d3.zoomTransform(this.svg.node()!);
        const newScale = Math.max(currentTransform.k / 1.5, 0.2);
        const transition = this.svg.transition().duration(300);
        // @ts-ignore
        transition.call(this.zoom.scaleTo, newScale);
    }

    public centerView(): void {
        const transition = this.svg.transition().duration(500);
        // @ts-ignore
        transition.call(this.zoom.transform, d3.zoomIdentity.scale(this.initialScale));
    }

    public fitView(): void {
        if (this.accounts.length === 0) return;

        // Calculate bounding box of all nodes
        const bounds = this.calculateNodeBounds();
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        const dx = bounds.maxX - bounds.minX;
        const dy = bounds.maxY - bounds.minY;
        const x = (bounds.minX + bounds.maxX) / 2;
        const y = (bounds.minY + bounds.maxY) / 2;
        
        const scale = Math.min(8, 0.8 / Math.max(dx / width, dy / height));
        const translate = [width / 2 - scale * x, height / 2 - scale * y];
        
        const transition = this.svg.transition().duration(750);
        // @ts-ignore
        transition.call(this.zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    }

    private calculateNodeBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        this.accounts.forEach((node: any) => {
            if (node.x !== undefined && node.y !== undefined) {
                minX = Math.min(minX, node.x);
                maxX = Math.max(maxX, node.x);
                minY = Math.min(minY, node.y);
                maxY = Math.max(maxY, node.y);
            }
        });
        
        return { minX, maxX, minY, maxY };
    }

    // Layout Presets
    public applyLayoutPreset(preset: string): void {
        this.addPresetAnimation();
        
        switch (preset) {
            case 'transaction-flow':
                this.applyTransactionFlowPreset();
                break;
            case 'risk-analysis':
                this.applyRiskAnalysisPreset();
                break;
            case 'cluster-analysis':
                this.applyClusterAnalysisPreset();
                break;
            case 'timeline-analysis':
                this.applyTimelineAnalysisPreset();
                break;
        }
    }

    private applyTransactionFlowPreset(): void {
        // Hierarchical layout with high-volume nodes at top
        this.setLayoutAlgorithm('hierarchical');
        this.setExpansionStrategy('volume');
        this.setPerformanceMode('balanced');
    }

    private applyRiskAnalysisPreset(): void {
        // Circular layout focusing on risk indicators
        this.setLayoutAlgorithm('circular');
        this.setExpansionStrategy('risk');
        this.setPerformanceMode('detailed');
    }

    private applyClusterAnalysisPreset(): void {
        // Force layout with clustering
        this.setLayoutAlgorithm('force');
        this.setExpansionStrategy('balanced');
        this.setPerformanceMode('balanced');
    }

    private applyTimelineAnalysisPreset(): void {
        // Grid layout for timeline analysis
        this.setLayoutAlgorithm('grid');
        this.setExpansionStrategy('importance');
        this.setPerformanceMode('fast');
    }

    // Visual Indicators
    private addSimulationIndicator(state: 'running' | 'paused' | 'locked'): void {
        d3.select('.simulation-indicator').remove();
        
        const indicator = d3.select('body')
            .append('div')
            .attr('class', `simulation-indicator ${state}`)
            .text(state.charAt(0).toUpperCase() + state.slice(1));
        
        // Auto-hide after 2 seconds if running
        if (state === 'running') {
            setTimeout(() => indicator.remove(), 2000);
        }
    }

    private addLayoutIndicator(algorithm: string): void {
        d3.select('.layout-algorithm-indicator').remove();
        
        d3.select('body')
            .append('div')
            .attr('class', 'layout-algorithm-indicator')
            .text(algorithm.charAt(0).toUpperCase() + algorithm.slice(1) + ' Layout')
            .transition()
            .delay(2000)
            .duration(500)
            .style('opacity', 0)
            .remove();
    }

    private addResetAnimation(): void {
        // Add a brief flash effect to indicate reset
        const overlay = d3.select('.graph-container')
            .append('div')
            .style('position', 'absolute')
            .style('top', '0')
            .style('left', '0')
            .style('width', '100%')
            .style('height', '100%')
            .style('background', 'rgba(255, 255, 255, 0.3)')
            .style('pointer-events', 'none')
            .style('z-index', '1000');
        
        overlay.transition()
            .duration(300)
            .style('opacity', 0)
            .remove();
    }

    private addPresetAnimation(): void {
        d3.select('.graph-container').classed('preset-applying', true);
        setTimeout(() => {
            d3.select('.graph-container').classed('preset-applying', false);
        }, 1500);
    }

    // Getters for current state
    public getCurrentLayoutAlgorithm(): string {
        return this.currentLayoutAlgorithm;
    }

    public isSimulationRunning(): boolean {
        return !this.isSimulationPaused && !this.arePositionsLocked;
    }

    public arePositionsCurrentlyLocked(): boolean {
        return this.arePositionsLocked;
    }
}

// Add expansion state visualization
function addExpansionIndicator(accountGroup: any, state: string): void {
    // Remove existing indicators
    accountGroup.select('.expansion-indicator').remove();
    
    if (state === 'expandable') {
        accountGroup.append('circle')
            .attr('class', 'expansion-indicator')
            .attr('r', 8)
            .attr('cx', ACCOUNT_RADIUS * 0.7)
            .attr('cy', -ACCOUNT_RADIUS * 0.7)
            .attr('fill', '#4CAF50')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('pointer-events', 'none');
        
        accountGroup.append('text')
            .attr('class', 'expansion-indicator')
            .attr('x', ACCOUNT_RADIUS * 0.7)
            .attr('y', -ACCOUNT_RADIUS * 0.7 + 3)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '10px')
            .attr('font-weight', 'bold')
            .text('+')
            .style('pointer-events', 'none');
    } else if (state === 'expanded') {
        accountGroup.append('circle')
            .attr('class', 'expansion-indicator')
            .attr('r', 8)
            .attr('cx', ACCOUNT_RADIUS * 0.7)
            .attr('cy', -ACCOUNT_RADIUS * 0.7)
            .attr('fill', '#2196F3')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('pointer-events', 'none');
        
        accountGroup.append('text')
            .attr('class', 'expansion-indicator')
            .attr('x', ACCOUNT_RADIUS * 0.7)
            .attr('y', -ACCOUNT_RADIUS * 0.7 + 3)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '8px')
            .attr('font-weight', 'bold')
            .text('✓')
            .style('pointer-events', 'none');
    } else if (state === 'expanding') {
        accountGroup.append('circle')
            .attr('class', 'expansion-indicator')
            .attr('r', 8)
            .attr('cx', ACCOUNT_RADIUS * 0.7)
            .attr('cy', -ACCOUNT_RADIUS * 0.7)
            .attr('fill', '#FF9800')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('pointer-events', 'none');
        
        accountGroup.append('text')
            .attr('class', 'expansion-indicator')
            .attr('x', ACCOUNT_RADIUS * 0.7)
            .attr('y', -ACCOUNT_RADIUS * 0.7 + 3)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '8px')
            .attr('font-weight', 'bold')
            .text('⧗')
            .style('pointer-events', 'none');
    } else if (state === 'max_depth') {
        accountGroup.append('circle')
            .attr('class', 'expansion-indicator')
            .attr('r', 8)
            .attr('cx', ACCOUNT_RADIUS * 0.7)
            .attr('cy', -ACCOUNT_RADIUS * 0.7)
            .attr('fill', '#9E9E9E')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('pointer-events', 'none');
        
        accountGroup.append('text')
            .attr('class', 'expansion-indicator')
            .attr('x', ACCOUNT_RADIUS * 0.7)
            .attr('y', -ACCOUNT_RADIUS * 0.7 + 3)
            .attr('text-anchor', 'middle')
            .attr('fill', '#fff')
            .attr('font-size', '8px')
            .attr('font-weight', 'bold')
            .text('■')
            .style('pointer-events', 'none');
    }
}

export { Graph, addExpansionIndicator };
