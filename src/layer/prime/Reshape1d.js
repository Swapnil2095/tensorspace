import {Layer2d} from "./abstract/Layer2d";
import {QueueCenterGenerator} from "../../utils/QueueCenterGenerator";
import {GridAggregation} from "../../elements/GridAggregation";
import {GridLine} from "../../elements/GridLine";
import { ChannelDataGenerator } from "../../utils/ChannelDataGenerator";
import { colorUtils } from "../../utils/ColorUtils";

function Reshape1d(config) {

	Layer2d.call(this, config);

	this.targetShape = undefined;
	this.width = undefined;
	this.depth = undefined;

	// set init size to be 1
	this.totalSize = 1;

	this.closeCenterList = [];
	this.openCenterList = [];
	this.centerList = [];

	this.loadLayerConfig(config);

	this.layerType = "reshape1d";

}

Reshape1d.prototype = Object.assign(Object.create(Layer2d.prototype), {

	init: function(center, actualDepth, nextHookHandler) {

		this.center = center;
		this.actualDepth = actualDepth;
		this.nextHookHandler = nextHookHandler;
		this.lastHookHandler = this.lastLayer.nextHookHandler;

		this.neuralGroup = new THREE.Group();
		this.neuralGroup.position.set(this.center.x, this.center.y, this.center.z);

		if (this.depth === 1) {
			this.isOpen = true;
			this.initSegregationElements(this.openFmCenters);
		} else {
			if (this.isOpen) {

				this.initSegregationElements(this.openFmCenters);
				this.initCloseButton();

			} else {
				this.initAggregationElement();
			}
		}

		this.scene.add(this.neuralGroup);

	},

	loadLayerConfig: function(layerConfig) {

		if (layerConfig !== undefined) {

			if (layerConfig.targetShape !== undefined) {
				this.targetShape = layerConfig.targetShape;
				this.width = layerConfig.targetShape[0];
			} else {
				console.error("\"targetShape\" property is required for reshape layer");
			}

		} else {
			console.error("\"Lack config for reshape layer.");
		}

	},

	loadModelConfig: function(modelConfig) {

		if (this.isOpen === undefined) {
			this.isOpen = modelConfig.layerInitStatus;
		}

		if (this.color === undefined) {
			this.color = modelConfig.color.reshape;
		}

		if (this.layerShape === undefined) {
			this.layerShape = modelConfig.layerShape;
		}

		if (this.relationSystem === undefined) {
			this.relationSystem = modelConfig.relationSystem;
		}

		if (this.textSystem === undefined) {
			this.textSystem = modelConfig.textSystem;
		}

		if (this.aggregationStrategy === undefined) {
			this.aggregationStrategy = modelConfig.aggregationStrategy;
		}

	},

	assemble: function(layerIndex) {

		this.layerIndex = layerIndex;

		this.inputShape = this.lastLayer.outputShape;

		for (let i = 0; i < this.inputShape.length; i++) {
			this.totalSize *= this.inputShape[i];
		}

		if (this.totalSize % (this.width) !== 0) {
			console.error("input size " + this.totalSize + " can not be reshape to [" + this.width + "]");
		}

		this.depth = this.totalSize / this.width;

		this.outputShape = [this.width, this.depth];

		this.unitLength = this.lastLayer.unitLength;
		this.actualWidth = this.width * this.unitLength;

		for (let i = 0; i < this.depth; i++) {
			let closeCenter = {
				x: 0,
				y: 0,
				z: 0
			};
			this.closeCenterList.push(closeCenter);
		}

		this.openCenterList = QueueCenterGenerator.getCenterList(this.actualWidth, this.depth);

	},

	initAggregationElement: function() {

		let aggregationHandler = new GridAggregation(
			this.width,
			this.actualWidth,
			this.unitLength,
			this.color
		);
		aggregationHandler.setLayerIndex(this.layerIndex);

		this.aggregationHandler = aggregationHandler;
		this.neuralGroup.add(this.aggregationHandler.getElement());

		if (this.neuralValue !== undefined) {
			this.updateAggregationVis();
		}

	},

	disposeAggregationElement: function() {

		this.neuralGroup.remove(this.aggregationHandler.getElement());
		this.aggregationHandler = undefined;

	},

	initSegregationElements: function(centers) {

		this.queueHandlers = [];

		for (let i = 0; i < this.depth; i++) {

			let queueHandler = new GridLine(
				this.width,
				this.actualWidth,
				this.unitLength,
				centers[i],
				this.color
			);

			queueHandler.setLayerIndex(this.layerIndex);
			queueHandler.setGridIndex(i);
			this.queueHandlers.push(queueHandler);
			this.neuralGroup.add(queueHandler.getElement());

		}

		if (this.neuralValue !== undefined) {
			this.updateSegregationVis();
		}

	},

	disposeSegregationElements: function() {

		for (let i = 0; i < this.depth; i++) {
			this.neuralGroup.remove(this.queueHandlers[i].getElement());
		}
		this.queueHandlers = [];

	},

	updateValue: function(value) {

		this.neuralValue = value;

		if (this.isOpen) {
			this.updateSegregationVis();
		} else {
			this.updateAggregationVis();
		}

	},

	updateSegregationVis: function() {

		let layerOutputValues = ChannelDataGenerator.generateChannelData(this.neuralValue, this.depth);

		let colors = colorUtils.getAdjustValues(layerOutputValues);

		let featureMapSize = this.width;

		for (let i = 0; i < this.depth; i++) {

			this.queueHandlers[i].updateVis(colors.slice(i * featureMapSize, (i + 1) * featureMapSize));

		}

	},

	updateAggregationVis: function() {

		let aggregationUpdateValue = ChannelDataGenerator.generateAggregationData(this.neuralValue, this.depth, this.aggregationStrategy);

		let colors = colorUtils.getAdjustValues(aggregationUpdateValue);

		this.aggregationHandler.updateVis(colors);

	},

	handleClick: function(clickedElement) {

		if (clickedElement.elementType === "aggregationElement") {
			this.openLayer();
		} else if (clickedElement.elementType === "closeButton") {
			this.closeLayer();
		}

	},

	handleHoverIn: function(hoveredElement) {

		if (this.relationSystem !== undefined && this.relationSystem) {
			this.initLineGroup(hoveredElement);
		}

		if (this.textSystem !== undefined && this.textSystem) {
			this.showText(hoveredElement);
		}

	},

	handleHoverOut: function() {

		if (this.relationSystem !== undefined && this.relationSystem) {
			this.disposeLineGroup();
		}

		if (this.textSystem !== undefined && this.textSystem) {
			this.hideText();
		}

	},

	showText: function(element) {

		if (element.elementType === "gridLine") {

			let gridIndex = element.gridIndex;

			this.queueHandlers[gridIndex].showText();
			this.textElementHandler = this.queueHandlers[gridIndex];
		}

	},

	hideText: function() {

		if (this.textElementHandler !== undefined) {

			this.textElementHandler.hideText();
			this.textElementHandler = undefined;
		}

	},

	getRelativeElements: function(selectedElement) {

		let relativeElements = [];

		if (selectedElement.elementType === "aggregationElement" || selectedElement.elementType === "gridLine") {

			if (this.lastLayer.isOpen) {

				// for (let i = 0; i < this.lastLayer.segregationHandlers.length; i++) {
				//
				// 	relativeElements.push(this.lastLayer.segregationHandlers[i].getElement());
				//
				// }

			} else {

				// relativeElements.push(this.lastLayer.aggregationHandler.getElement());

			}

		}

		return relativeElements;

	}



});

export { Reshape1d }