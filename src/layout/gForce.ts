/**
 * @fileOverview fruchterman layout
 * @author shiwu.wyy@antfin.com
 */

 import {
  OutNode,
  Edge,
  PointTuple,
  IndexMap,
  Point,
  GForceLayoutOptions,
  Degree
} from "./types";
import { Base } from "./base";
import { isNumber, isFunction, isArray, getDegree, isObject, getEdgeTerminal } from "../util";

type INode = OutNode & {
  size: number | PointTuple;
};

type NodeMap = {
  [key: string]: INode;
};

const proccessToFunc = (
  value: number | Function | undefined,
  defaultV?: number
): ((d: any) => number) => {
  let func;
  if (!value) {
    func = (d: any): number => {
      return defaultV || 1;
    };
  } else if (isNumber(value)) {
    func = (d: any): number => {
      return value;
    };
  } else {
    func = value;
  }
  return func as any;
};

/**
 * graphin 中的 force 布局
 */
export class GForceLayout extends Base {
  /** 布局中心 */
  public center: PointTuple;

  /** 停止迭代的最大迭代数 */
  public maxIteration: number = 500;

  /** 是否启动 worker */
  public workerEnabled: boolean = false;

  /** 弹簧引力系数 */
  public edgeStrength: number | ((d?: any) => number) | undefined = 200;

  /** 斥力系数 */
  public nodeStrength: number | ((d?: any) => number) | undefined = 1000;

  /** 库伦系数 */
  public coulombDisScale: number = 0.005;

  /** 阻尼系数 */
  public damping: number = 0.9;

  /** 最大速度 */
  public maxSpeed: number = 1000;

  /** 一次迭代的平均移动距离小于该值时停止迭代 */
  public minMovement: number = 0.5;

  /** 迭代中衰减 */
  public interval: number = 0.02;

  /** 斥力的一个系数 */
  public factor: number = 1;

  /** 每个节点质量的回调函数，若不指定，则默认使用度数作为节点质量 */
  public getMass: ((d?: any) => number) | undefined;

  /** 每个节点中心力的 x、y、强度的回调函数，若不指定，则没有额外中心力 */
  public getCenter: ((d?: any, degree?: number) => number[]) | undefined;

  /** 理想边长 */
  public linkDistance: number | ((edge?: any, source?: any, target?: any) => number) | undefined = 1;

  /** 重力大小 */
  public gravity: number = 10;

  /** 是否防止重叠 */
  public preventOverlap: boolean = true;

  /** 防止重叠时的节点大小，默认从节点数据中取 size */
  public nodeSize: number | number[] | ((d?: any) => number) | undefined;

  /** 防止重叠的力大小参数 */
  public collideStrength: number = 1;

  /** 防止重叠时的节点之间最小间距 */
  public nodeSpacing: number | number[] | ((d?: any) => number) | undefined;

  /** 每次迭代结束的回调函数 */
  public tick: (() => void) | null = () => {};

  /** 是否允许每次迭代结束调用回调函数 */
  public enableTick: boolean;

  public nodes: INode[] | null = [];

  public edges: Edge[] | null = [];

  public width: number = 300;

  public height: number = 300;

  public nodeMap: NodeMap = {};

  public nodeIdxMap: IndexMap = {};

  public canvasEl: HTMLCanvasElement;

  public onLayoutEnd: () => void;

  /** 是否使用 window.setInterval 运行迭代 */
  public animate: Boolean = true;

  /** 存储节点度数 */
  private degrees: Degree[];

  /** 迭代中的标识 */
  private timeInterval: number;

  constructor(options?: GForceLayoutOptions) {
    super();
    this.updateCfg(options);
  }

  public getDefaultCfg() {
    return {
      maxIteration: 500,
      gravity: 10,
      enableTick: true,
      animate: true,
    };
  }

  /**
   * 执行布局
   */
  public execute() {
    const self = this;
    const nodes = self.nodes;

    if (self.timeInterval !== undefined && typeof window !== "undefined") {
      window.clearInterval(self.timeInterval);
    }

    if (!nodes || nodes.length === 0) {
      self.onLayoutEnd?.();
      return;
    }

    if (!self.width && typeof window !== "undefined") {
      self.width = window.innerWidth;
    }
    if (!self.height && typeof window !== "undefined") {
      self.height = window.innerHeight;
    }
    if (!self.center) {
      self.center = [self.width / 2, self.height / 2];
    }
    const center = self.center;

    if (nodes.length === 1) {
      nodes[0].x = center[0];
      nodes[0].y = center[1];
      self.onLayoutEnd?.();
      return;
    }
    const nodeMap: NodeMap = {};
    const nodeIdxMap: IndexMap = {};
    nodes.forEach((node, i) => {
      if (!isNumber(node.x)) node.x = Math.random() * self.width;
      if (!isNumber(node.y)) node.y = Math.random() * self.height;
      nodeMap[node.id] = node;
      nodeIdxMap[node.id] = i;
    });
    self.nodeMap = nodeMap;
    self.nodeIdxMap = nodeIdxMap;

    self.linkDistance = proccessToFunc(self.linkDistance, 1);
    self.nodeStrength = proccessToFunc(self.nodeStrength, 1);
    self.edgeStrength = proccessToFunc(self.edgeStrength, 1);

    // node size function
    const nodeSize = self.nodeSize;
    let nodeSizeFunc;
    if (self.preventOverlap) {
      const nodeSpacing = self.nodeSpacing;
      let nodeSpacingFunc: (d?: any) => number;
      if (isNumber(nodeSpacing)) {
        nodeSpacingFunc = () => nodeSpacing as number;
      } else if (isFunction(nodeSpacing)) {
        nodeSpacingFunc = nodeSpacing as (d?: any) => number;
      } else {
        nodeSpacingFunc = () => 0;
      }
      if (!nodeSize) {
        nodeSizeFunc = (d: INode) => {
          if (d.size) {
            if (isArray(d.size)) {
              return Math.max(d.size[0], d.size[1]) + nodeSpacingFunc(d);
            }  if(isObject(d.size)) {
              return Math.max(d.size.width, d.size.height) + nodeSpacingFunc(d);
            }
            return (d.size as number) + nodeSpacingFunc(d);
          }
          return 10 + nodeSpacingFunc(d);
        };
      } else if (isArray(nodeSize)) {
        nodeSizeFunc = (d: INode) => {
          return Math.max(nodeSize[0], nodeSize[1]) + nodeSpacingFunc(d);
        };
      } else {
        nodeSizeFunc = (d: INode) => (nodeSize as number) + nodeSpacingFunc(d);
      }
    }
    self.nodeSize = nodeSizeFunc;

    const edges = self.edges;
    self.degrees = getDegree(nodes.length, self.nodeIdxMap, edges);
    if (!self.getMass) {
      self.getMass = (d) => {
        const mass = d.mass || self.degrees[self.nodeIdxMap[d.id]].all || 1;
        return mass;
      };
    }

    // layout
    self.run();
  }

  public run() {
    const self = this;
    const { maxIteration, nodes, workerEnabled, minMovement, animate } = self;

    if (!nodes) return;

    if (workerEnabled || !animate) {
      for (let i = 0; i < maxIteration; i++) {
        const previousPos = self.runOneStep(i);
        if (self.reachMoveThreshold(nodes, previousPos, minMovement)) {
          break;
        }
      }
      self.onLayoutEnd?.();
    } else {
      if (typeof window === "undefined") return;
      let iter = 0;
      // interval for render the result after each iteration
      this.timeInterval = window.setInterval(() => {
        if (!nodes) return;
        const previousPos = self.runOneStep(iter) || [];
        if (self.reachMoveThreshold(nodes, previousPos, minMovement)) {
          self.onLayoutEnd?.();
          window.clearInterval(self.timeInterval);
        }
        iter++;
        if (iter >= maxIteration) {
          self.onLayoutEnd?.();
          window.clearInterval(self.timeInterval);
        }
      }, 0);
    }
  }

  private reachMoveThreshold(nodes: any, previousPos: any, minMovement: number) {
    // whether to stop the iteration
    let movement = 0;
    nodes.forEach((node: any, j: number) => {
      const vx = node.x - previousPos[j].x;
      const vy = node.y - previousPos[j].y;
      movement += Math.sqrt(vx * vx + vy * vy);
    });
    movement /= nodes.length;
    return movement < minMovement;
  }

  private runOneStep(iter: number) {
    const self = this;
    const { nodes, edges } = self;
    const accArray: number[] = [];
    const velArray: number[] = [];
    if (!nodes) return;
    nodes.forEach((_, i) => {
      accArray[2 * i] = 0;
      accArray[2 * i + 1] = 0;
      velArray[2 * i] = 0;
      velArray[2 * i + 1] = 0;
    });
    self.calRepulsive(accArray, nodes);
    if (edges) self.calAttractive(accArray, edges);
    self.calGravity(accArray, nodes);
    const stepInterval = Math.max(0.02, self.interval - iter * 0.002);
    self.updateVelocity(accArray, velArray, stepInterval, nodes);
    const previousPos: Point[] = [];
    nodes.forEach((node) => {
      previousPos.push({
        x: node.x,
        y: node.y
      });
    });
    self.updatePosition(velArray, stepInterval, nodes);
    self.tick?.();
    return previousPos;
  }

  public calRepulsive(accArray: number[], nodes: INode[]) {
    const self = this;
    const { getMass, factor, coulombDisScale, preventOverlap, collideStrength = 1 } = self;
    const nodeStrength = self.nodeStrength as Function;
    const nodeSize = self.nodeSize as Function;
    nodes.forEach((ni: INode, i) => {
      const massi = getMass ? getMass(ni) : 1;
      nodes.forEach((nj, j) => {
        if (i >= j) return;
        // if (!accArray[j]) accArray[j] = 0;
        let vecX = ni.x - nj.x;
        let vecY = ni.y - nj.y;
        if (vecX === 0 && vecY === 0) {
          vecX = Math.random() * 0.01;
          vecY = Math.random() * 0.01;
        }
        const lengthSqr = vecX * vecX + vecY * vecY;
        const vecLength = Math.sqrt(lengthSqr);
        const nVecLength = (vecLength + 0.1) * coulombDisScale;
        const direX = vecX / vecLength;
        const direY = vecY / vecLength;
        const param =
          (((nodeStrength(ni) + nodeStrength(nj)) * 0.5) * factor) /
          (nVecLength * nVecLength);
        const massj = getMass ? getMass(nj) : 1;
        accArray[2 * i] += (direX * param);
        accArray[2 * i + 1] += (direY * param);
        accArray[2 * j] -= (direX * param);
        accArray[2 * j + 1] -= (direY * param);
        if (preventOverlap && (nodeSize(ni) + nodeSize(nj)) / 2 > vecLength) {
          const paramOverlap =
            collideStrength * (nodeStrength(ni) + nodeStrength(nj)) * 0.5 / lengthSqr;
          accArray[2 * i] += (direX * paramOverlap) / massi;
          accArray[2 * i + 1] += (direY * paramOverlap) / massi;
          accArray[2 * j] -= (direX * paramOverlap) / massj;
          accArray[2 * j + 1] -= (direY * paramOverlap) / massj;
        }
      });
    });
  }

  public calAttractive(accArray: number[], edges: Edge[]) {
    const self = this;
    const { nodeMap, nodeIdxMap, linkDistance, edgeStrength } = self;
    const nodeSize = self.nodeSize as Function;
    const getMass = self.getMass;
    edges.forEach((edge, i) => {
      const source = getEdgeTerminal(edge, 'source');
      const target = getEdgeTerminal(edge, 'target');
      const sourceNode = nodeMap[source];
      const targetNode = nodeMap[target];
      let vecX = targetNode.x - sourceNode.x;
      let vecY = targetNode.y - sourceNode.y;
      if (vecX === 0 && vecY === 0) {
        vecX = Math.random() * 0.01;
        vecY = Math.random() * 0.01;
      }
      const vecLength = Math.sqrt(vecX * vecX + vecY * vecY);
      const direX = vecX / vecLength;
      const direY = vecY / vecLength;
      const length = (linkDistance as Function)(edge, sourceNode, targetNode) || 1 + ((nodeSize(sourceNode) + nodeSize(targetNode)) || 0) / 2;
      const diff = length - vecLength;
      const param = diff * (edgeStrength as Function)(edge);
      const sourceIdx = nodeIdxMap[source];
      const targetIdx = nodeIdxMap[target];
      const massSource = getMass ? getMass(sourceNode) : 1;
      const massTarget = getMass ? getMass(targetNode) : 1;
      accArray[2 * sourceIdx] -= (direX * param) / massSource;
      accArray[2 * sourceIdx + 1] -= (direY * param) / massSource;
      accArray[2 * targetIdx] += (direX * param) / massTarget;
      accArray[2 * targetIdx + 1] += (direY * param) / massTarget;
    });
  }

  public calGravity(accArray: number[], nodes: INode[]) {
    const self = this;
    // const nodes = self.nodes;
    const center = self.center;
    const defaultGravity = self.gravity;
    const degrees = self.degrees;
    const nodeLength = nodes.length;
    for (let i = 0; i < nodeLength; i++) {
      const node = nodes[i];
      let vecX = node.x - center[0];
      let vecY = node.y - center[1];
      let gravity = defaultGravity;

      if (self.getCenter) {
        const customCenterOpt = self.getCenter(node, degrees[i].all);
        if (
          customCenterOpt &&
          isNumber(customCenterOpt[0]) &&
          isNumber(customCenterOpt[1]) &&
          isNumber(customCenterOpt[2])
        ) {
          vecX = node.x - customCenterOpt[0];
          vecY = node.y - customCenterOpt[1];
          gravity = customCenterOpt[2];
        }
      }
      if (!gravity) continue;

      accArray[2 * i] -= gravity * vecX;
      accArray[2 * i + 1] -= gravity * vecY;
    }
  }

  public updateVelocity(
    accArray: number[],
    velArray: number[],
    stepInterval: number,
    nodes: INode[]
  ) {
    const self = this;
    const param = stepInterval * self.damping;
    // const nodes = self.nodes;
    nodes.forEach((node, i) => {
      let vx = accArray[2 * i] * param || 0.01;
      let vy = accArray[2 * i + 1] * param || 0.01;
      const vLength = Math.sqrt(vx * vx + vy * vy);
      if (vLength > self.maxSpeed) {
        const param2 = self.maxSpeed / vLength;
        vx = param2 * vx;
        vy = param2 * vy;
      }
      velArray[2 * i] = vx;
      velArray[2 * i + 1] = vy;
    });
  }

  public updatePosition(
    velArray: number[],
    stepInterval: number,
    nodes: INode[]
  ) {
    nodes.forEach((node: any, i) => {
      if (isNumber(node.fx) && isNumber(node.fy)) {
        node.x = node.fx;
        node.y = node.fy;
        return;
      }
      const distX = velArray[2 * i] * stepInterval;
      const distY = velArray[2 * i + 1] * stepInterval;
      node.x += distX;
      node.y += distY;
    });
  }

  public stop() {
    if (this.timeInterval && typeof window !== "undefined") {
      window.clearInterval(this.timeInterval);
    }
  }

  public destroy() {
    const self = this;
    self.stop();
    self.tick = null;
    self.nodes = null;
    self.edges = null;
    self.destroyed = true;
  }

  public getType() {
    return "gForce";
  }
}
