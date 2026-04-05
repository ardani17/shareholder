import { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import {
  getGraphNodes, getGraphEdges, getSubgraph,
  searchGraphNodes, findPath,
  getEmitensByShareholder, getShareholdersByEmiten,
} from '../api/client';

interface GraphNode { id: string; type: 'emiten' | 'shareholder'; label: string; size: number }
interface GraphEdge { source: string; target: string; percentage: number }
interface SearchResult { id: string; type: 'emiten' | 'shareholder'; label: string; size: number }
interface SimNode extends d3.SimulationNodeDatum { id: string; type: 'emiten' | 'shareholder'; label: string; size: number }
interface SimLink extends d3.SimulationLinkDatum<SimNode> { percentage: number }
interface DetailItem { name: string; percentage: number; symbol?: string }

const EMITEN_COLOR = '#1976d2';
const SHAREHOLDER_COLOR = '#ff9800';
const HIGHLIGHT_COLOR = '#e91e63';
const DIM_OPACITY = 0.08;

const box: React.CSSProperties = { border: '1px solid #ddd', borderRadius: 6, padding: 12, marginBottom: 12 };
const btn: React.CSSProperties = { padding: '6px 14px', cursor: 'pointer', borderRadius: 4, border: '1px solid #999', background: '#f5f5f5', fontSize: 13 };
const inp: React.CSSProperties = { padding: 6, borderRadius: 4, border: '1px solid #bbb', fontSize: 13 };
const tagStyle: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, marginRight: 4 };

export default function NetworkGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);

  // Filters
  const [minEmitens, setMinEmitens] = useState('3');
  const [minPct, setMinPct] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Detail panel
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DetailItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Path finder
  const [pathFrom, setPathFrom] = useState('');
  const [pathTo, setPathTo] = useState('');
  const [pathResult, setPathResult] = useState<{ path: Array<{ from: string; to: string; via: string; percentage: number }>; found: boolean } | null>(null);
  const [pathLoading, setPathLoading] = useState(false);

  // --- Reusable highlight function ---
  const highlightNodeIds = (ids: Set<string>) => {
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGCircleElement, SimNode>('circle')
      .attr('opacity', n => ids.has(n.id) ? 1 : DIM_OPACITY)
      .attr('stroke', n => ids.has(n.id) ? HIGHLIGHT_COLOR : '#fff')
      .attr('stroke-width', n => ids.has(n.id) ? 2.5 : 1.2);
    svg.selectAll<SVGLineElement, SimLink>('line')
      .attr('opacity', l => {
        const s = typeof l.source === 'object' ? (l.source as SimNode).id : String(l.source);
        const t = typeof l.target === 'object' ? (l.target as SimNode).id : String(l.target);
        return ids.has(s) && ids.has(t) ? 1 : DIM_OPACITY;
      })
      .attr('stroke', l => {
        const s = typeof l.source === 'object' ? (l.source as SimNode).id : String(l.source);
        const t = typeof l.target === 'object' ? (l.target as SimNode).id : String(l.target);
        return ids.has(s) && ids.has(t) ? HIGHLIGHT_COLOR : '#bbb';
      });
    svg.selectAll<SVGTextElement, SimNode>('text')
      .attr('opacity', n => ids.has(n.id) ? 1 : DIM_OPACITY)
      .attr('font-weight', n => ids.has(n.id) ? 700 : 400);
  };

  const zoomToNode = (nodeId: string) => {
    const svg = d3.select(svgRef.current);
    svg.selectAll<SVGCircleElement, SimNode>('circle').each(function(d) {
      if (d.id === nodeId && d.x != null && d.y != null) {
        const width = svgRef.current?.clientWidth || 960;
        const height = 650;
        const transform = d3.zoomIdentity.translate(width / 2 - d.x * 2, height / 2 - d.y * 2).scale(2);
        svg.transition().duration(600).call((d3.zoom() as any).transform, transform);
      }
    });
  };

  /** Core highlight: fetch subgraph, apply dim/highlight, zoom to node */
  const highlightSubgraph = async (nodeId: string) => {
    try {
      const sub = await getSubgraph(nodeId);
      const ids = new Set(sub.nodes.map(n => n.id));

      // Check if node exists in current graph
      const nodeInGraph = nodesRef.current.some(n => n.id === nodeId);

      if (!nodeInGraph) {
        // Node not in current graph — load its subgraph as the graph data
        nodesRef.current = sub.nodes;
        edgesRef.current = sub.edges;
        setNodeCount(sub.nodes.length);
        setEdgeCount(sub.edges.length);
        buildGraph();
        // After rebuild, highlight all (they're all connected)
        setTimeout(() => {
          highlightNodeIds(ids);
          zoomToNode(nodeId);
        }, 300);
      } else {
        // Node is in graph — just dim/highlight
        highlightNodeIds(ids);
        zoomToNode(nodeId);
      }
    } catch {
      // ignore
    }
  };

  // --- Graph rendering ---
  const buildGraph = useCallback(() => {
    const svg = d3.select(svgRef.current);
    if (!svgRef.current) return;
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 960;
    const height = 650;

    const nodes: SimNode[] = nodesRef.current.map(n => ({ ...n }));
    const links: SimLink[] = edgesRef.current.map(e => ({ source: e.source, target: e.target, percentage: e.percentage }));
    if (nodes.length === 0) return;

    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.05, 10]).on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom as any);

    const maxSize = d3.max(nodes, d => d.size) || 1;
    const rScale = d3.scaleSqrt().domain([1, maxSize]).range([4, 22]);
    const maxPctVal = d3.max(links, d => d.percentage) || 1;
    const wScale = d3.scaleLinear().domain([0, maxPctVal]).range([0.3, 3.5]);

    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id(d => d.id).distance(70))
      .force('charge', d3.forceManyBody().strength(-100))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<SimNode>().radius(d => rScale(d.size) + 2));
    simRef.current = sim;

    g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', '#bbb').attr('stroke-opacity', 0.5).attr('stroke-width', d => wScale(d.percentage));

    const node = g.append('g').selectAll('circle').data(nodes).join('circle')
      .attr('r', d => rScale(d.size))
      .attr('fill', d => d.type === 'emiten' ? EMITEN_COLOR : SHAREHOLDER_COLOR)
      .attr('stroke', '#fff').attr('stroke-width', 1.2).style('cursor', 'pointer')
      .call(d3.drag<SVGCircleElement, SimNode>()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }) as any);

    // Click on SVG node → highlight + detail
    node.on('click', (_e, d) => {
      handleNodeClick(d.id);
      highlightSubgraph(d.id);
    });

    g.append('g').selectAll('text').data(nodes).join('text')
      .text(d => d.label).attr('font-size', 9).attr('dx', d => rScale(d.size) + 2).attr('dy', 3)
      .attr('fill', '#444').style('pointer-events', 'none');

    sim.on('tick', () => {
      g.selectAll<SVGLineElement, SimLink>('line')
        .attr('x1', d => (d.source as SimNode).x!).attr('y1', d => (d.source as SimNode).y!)
        .attr('x2', d => (d.target as SimNode).x!).attr('y2', d => (d.target as SimNode).y!);
      g.selectAll<SVGCircleElement, SimNode>('circle')
        .attr('cx', d => d.x!).attr('cy', d => d.y!);
      g.selectAll<SVGTextElement, SimNode>('text')
        .attr('x', d => d.x!).attr('y', d => d.y!);
    });
  }, []);

  // --- Data loading ---
  const loadData = useCallback(async () => {
    setLoading(true); setError(null); setSelectedNode(null); setDetailData([]);
    try {
      const me = parseInt(minEmitens, 10) || 1;
      const mp = parseFloat(minPct) || undefined;
      const [nodes, edges] = await Promise.all([getGraphNodes(me > 1 ? me : undefined), getGraphEdges(me > 1 ? me : undefined)]);

      let filteredEdges = edges;
      if (mp) filteredEdges = edges.filter(e => e.percentage >= mp);

      let filteredNodes = nodes;
      if (mp) {
        const connectedIds = new Set<string>();
        filteredEdges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target); });
        filteredNodes = nodes.filter(n => connectedIds.has(n.id));
      }

      nodesRef.current = filteredNodes;
      edgesRef.current = filteredEdges;
      setNodeCount(filteredNodes.length);
      setEdgeCount(filteredEdges.length);
      buildGraph();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph');
    } finally { setLoading(false); }
  }, [minEmitens, minPct, buildGraph]);

  useEffect(() => { loadData(); }, []); // eslint-disable-line
  useEffect(() => { return () => { simRef.current?.stop(); }; }, []);

  // --- Search ---
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const results = await searchGraphNodes(searchQuery, 10);
      setSearchResults(results);
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  };

  /** Click search result → load detail + highlight subgraph in visual */
  const focusNode = (nodeId: string) => {
    setSearchResults([]);
    handleNodeClick(nodeId);
    highlightSubgraph(nodeId);
  };

  // --- Node detail ---
  const handleNodeClick = async (nodeId: string) => {
    setSelectedNode(nodeId);
    setDetailLoading(true);
    setDetailData([]);
    try {
      if (nodeId.startsWith('shareholder:')) {
        const name = nodeId.slice('shareholder:'.length);
        const res = await getEmitensByShareholder(name);
        setDetailData(res.data.map(d => ({ name: `${d.symbol} - ${d.emitenName}`, percentage: d.percentage, symbol: d.symbol })));
      } else {
        const symbol = nodeId.slice('emiten:'.length);
        const res = await getShareholdersByEmiten(symbol);
        setDetailData(res.data.map(d => ({ name: d.shareholderName, percentage: d.percentage })));
      }
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  };

  // --- Path finder ---
  const handleFindPath = async () => {
    if (!pathFrom.trim() || !pathTo.trim()) return;
    setPathLoading(true); setPathResult(null);
    try {
      const result = await findPath(pathFrom, pathTo);
      setPathResult(result);
    } catch { setPathResult({ path: [], found: false }); }
    finally { setPathLoading(false); }
  };

  const clearHighlight = () => {
    setSelectedNode(null); setDetailData([]);
    const svg = d3.select(svgRef.current);
    svg.selectAll('circle').attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.2);
    svg.selectAll('line').attr('opacity', 1).attr('stroke', '#bbb');
    svg.selectAll('text').attr('opacity', 1).attr('font-weight', 400);
  };

  return (
    <div style={{ display: 'flex', gap: 16, padding: 16, fontFamily: 'sans-serif', maxWidth: 1400, margin: '0 auto' }}>
      {/* Left sidebar */}
      <div style={{ width: 320, flexShrink: 0 }}>
        <h2 style={{ margin: '0 0 12px' }}>Network Graph</h2>

        {/* Search */}
        <div style={box}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>🔍 Search Node</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="Shareholder or emiten..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            <button style={btn} onClick={handleSearch} disabled={searchLoading}>{searchLoading ? '...' : 'Go'}</button>
          </div>
          {searchResults.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
              {searchResults.map(r => (
                <div key={r.id} onClick={() => focusNode(r.id)}
                  style={{ padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: 12 }}>
                  <span style={{ ...tagStyle, background: r.type === 'emiten' ? '#e3f2fd' : '#fff3e0', color: r.type === 'emiten' ? EMITEN_COLOR : '#e65100' }}>
                    {r.type}
                  </span>
                  {r.label} <span style={{ color: '#999' }}>({r.size})</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={box}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>⚙️ Filters</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: '#666' }}>Min Emitens</label>
              <input style={{ ...inp, width: '100%' }} type="number" min={1} value={minEmitens} onChange={e => setMinEmitens(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: '#666' }}>Min Ownership %</label>
              <input style={{ ...inp, width: '100%' }} type="number" min={1} max={100} value={minPct} onChange={e => setMinPct(e.target.value)} placeholder="Any" />
            </div>
          </div>
          <button style={{ ...btn, width: '100%' }} onClick={loadData} disabled={loading}>
            {loading ? 'Loading...' : 'Apply Filters'}
          </button>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#888' }}>Nodes: {nodeCount} | Edges: {edgeCount}</p>
        </div>

        {/* Path Finder */}
        <div style={box}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>🔗 Path Finder</div>
          <input style={{ ...inp, width: '100%', marginBottom: 4 }} placeholder="From (e.g. shareholder:GOVERNMENT OF NORWAY)"
            value={pathFrom} onChange={e => setPathFrom(e.target.value)} />
          <input style={{ ...inp, width: '100%', marginBottom: 4 }} placeholder="To (e.g. shareholder:DRS LO KHENG HONG)"
            value={pathTo} onChange={e => setPathTo(e.target.value)} />
          <button style={{ ...btn, width: '100%' }} onClick={handleFindPath} disabled={pathLoading}>
            {pathLoading ? 'Searching...' : 'Find Path'}
          </button>
          {pathResult && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {pathResult.found ? (
                <div>
                  <div style={{ color: 'green', fontWeight: 600 }}>Path found ({pathResult.path.length} steps)</div>
                  {pathResult.path.map((step, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ color: '#666' }}>{i + 1}.</span> {step.from.split(':')[1]} → <span style={{ fontWeight: 600 }}>{step.via}</span> → {step.to.split(':')[1]}
                      <span style={{ color: '#999', marginLeft: 4 }}>({step.percentage.toFixed(1)}%)</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#999' }}>No path found (max 4 hops)</div>
              )}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedNode && (
          <div style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>📋 {selectedNode.split(':')[1]}</div>
              <button style={{ ...btn, padding: '2px 8px', fontSize: 11 }} onClick={clearHighlight}>✕</button>
            </div>
            <span style={{ ...tagStyle, background: selectedNode.startsWith('emiten:') ? '#e3f2fd' : '#fff3e0',
              color: selectedNode.startsWith('emiten:') ? EMITEN_COLOR : '#e65100' }}>
              {selectedNode.startsWith('emiten:') ? 'Emiten' : 'Shareholder'}
            </span>
            {detailLoading ? <p style={{ fontSize: 12 }}>Loading...</p> : (
              <div style={{ maxHeight: 250, overflowY: 'auto', marginTop: 8 }}>
                {detailData.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 }}>
                    <span style={{ flex: 1 }}>{d.name}</span>
                    <span style={{ fontWeight: 600, color: d.percentage >= 50 ? '#d32f2f' : d.percentage >= 20 ? '#f57c00' : '#666' }}>
                      {d.percentage.toFixed(2)}%
                    </span>
                  </div>
                ))}
                {detailData.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>No data</p>}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div style={{ ...box, display: 'flex', gap: 16, fontSize: 12 }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: EMITEN_COLOR, marginRight: 4, verticalAlign: 'middle' }} />Emiten</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: SHAREHOLDER_COLOR, marginRight: 4, verticalAlign: 'middle' }} />Shareholder</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: `2px solid ${HIGHLIGHT_COLOR}`, marginRight: 4, verticalAlign: 'middle' }} />Highlighted</span>
        </div>
      </div>

      {/* Graph area */}
      <div style={{ flex: 1 }}>
        {error && <p style={{ color: 'red', margin: '0 0 8px' }}>Error: {error}</p>}
        <div style={{ border: '1px solid #ddd', borderRadius: 6, overflow: 'hidden', background: '#fafafa' }}>
          <svg ref={svgRef} width="100%" height={650} style={{ display: 'block' }} />
        </div>
      </div>
    </div>
  );
}
