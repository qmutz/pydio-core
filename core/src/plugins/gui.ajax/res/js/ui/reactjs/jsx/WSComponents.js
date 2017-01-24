(function(global){

    let MessagesProviderMixin = {

        childContextTypes: {
            messages:React.PropTypes.object,
            getMessage:React.PropTypes.func
        },

        getChildContext: function() {
            var messages = this.props.pydio.MessageHash;
            return {
                messages: messages,
                getMessage: function(messageId){
                    try{
                        return messages[messageId] || messageId;
                    }catch(e){
                        return messageId;
                    }
                }
            };
        }

    };

    let FilePreview = React.createClass({

        propTypes: {
            node: React.PropTypes.instanceOf(AjxpNode),
            noRichPreview: React.PropTypes.bool
        },

        getInitialState: function(){
            return {loading: false, element: null}
        },

        componentDidMount: function(){
            this.loadCoveringImage();
        },

        componentWillReceiveProps: function(nextProps){
            if(nextProps.node.getPath() !== this.props.node.getPath()){
                this.loadCoveringImage();
                return;
            }
            if(nextProps.noRichPreview !== this.props.noRichPreview && !nextProps.noRichPreview){
                this.loadCoveringImage(true);
            }
        },

        loadCoveringImage: function(force = false){
            if(this.props.noRichPreview && !force){
                return;
            }
            let pydio = global.pydio, node = this.props.node;
            let editors = global.pydio.Registry.findEditorsForMime((node.isLeaf()?node.getAjxpMime():"mime_folder"), true);
            if(!editors || !editors.length) {
                return;
            }
            let editor = editors[0];
            pydio.Registry.loadEditorResources(editors[0].resourcesManager);
            var editorClass = Class.getByName(editors[0].editorClass);
            if(editorClass.prototype.getCoveringBackgroundSource){
                let image = new Image();
                let bgUrl = editorClass.prototype.getCoveringBackgroundSource(node);

                let loader = function(){
                    if(!this.isMounted) return;
                    bgUrl = bgUrl.replace('(', '\\(').replace(')', '\\)').replace('\'', '\\\'');
                    let element = (<div className="covering-bg-preview" style={{
                        backgroundImage:'url(' + bgUrl + ')',
                        backgroundSize : 'cover'
                    }}></div>);
                    this.setState({loading: false, element: element});
                }.bind(this);
                this.setState({loading: true});
                image.src = bgUrl;
                if(image.readyState && image.readyState === 'complete'){
                    loader();
                }else{
                    image.onload = loader();
                }
            }

        },

        render: function(){

            if(this.state.element){
                return this.state.element;
            }

            let node  = this.props.node;
            let svg = AbstractEditor.prototype.getSvgSource(node);
            let object;
            if(svg){
                object = <div className="mimefont-container"><div className={"mimefont mdi mdi-" + svg}></div></div>;
            }else{
                var src = ResourcesManager.resolveImageSource(node.getIcon(), "mimes/ICON_SIZE", 64);
                if(!src){
                    if(!node.isLeaf()) src = ResourcesManager.resolveImageSource('folder.png', "mimes/ICON_SIZE", 64);
                    else src = ResourcesManager.resolveImageSource('mime_empty.png', "mimes/ICON_SIZE", 64);
                }
                object = <img src={src}/>
            }

            return object;

        }

    });


    let MainFilesList = React.createClass({

        mixins: [MessagesProviderMixin],

        propTypes: {
            pydio: React.PropTypes.instanceOf(Pydio)
        },

        getInitialState: function(){
            return {
                contextNode : this.props.pydio.getContextHolder().getContextNode(),
                displayMode : 'list',
                thumbNearest: 200,
                thumbSize   : 200,
                elementsPerLine: 5,
                columns     : {
                    text:{label:'File Name', message:'1', width: '50%', renderCell:this.tableEntryRenderCell.bind(this)},
                    filesize:{label:'File Size', message:'2'},
                    mimestring:{label:'File Type', message:'3'},
                    ajxp_modiftime:{label:'Mofidied on', message:'4'}
                },
                parentIsScrolling: this.props.parentIsScrolling
            }
        },

        pydioResize: function(){
            if(this.refs['list']){
                this.refs['list'].updateInfiniteContainerHeight();
            }
            this.recomputeThumbnailsDimension();
        },

        recomputeThumbnailsDimension: function(nearest){

            if(!nearest){
                nearest = this.state.thumbNearest;
            }

            let containerWidth = this.refs['list'].getDOMNode().clientWidth;

            // Find nearest dim
            let blockNumber = Math.floor(containerWidth / nearest);
            let width = Math.floor(containerWidth / blockNumber);

            this.setState({
                elementsPerLine: blockNumber,
                thumbSize: width,
                thumbNearest:nearest
            });
        },

        componentDidMount: function(){
            // Hook to the central datamodel
            this._contextObserver = function(){
                this.setState({contextNode: this.props.pydio.getContextHolder().getContextNode()});
            }.bind(this);
            this.props.pydio.getContextHolder().observe("context_changed", this._contextObserver);
            this.recomputeThumbnailsDimension();
        },

        componentWillUnmount: function(){
            this.props.pydio.getContextHolder().stopObserving("context_changed", this._contextObserver);
        },

        selectNode: function(node){
            if(node.isLeaf()){
                this.props.pydio.getContextHolder().setSelectedNodes([node]);
            }else{
                this.props.pydio.getContextHolder().requireContextChange(node);
            }
        },

        entryRenderIcon: function(node, entryProps = {}){
            return <FilePreview noRichPreview={!!entryProps['parentIsScrolling']} node={node}/>;
        },

        tableEntryRenderCell: function(node){
            return <span><FilePreview noRichPreview={true} node={node}/> {node.getLabel()}</span>;
        },

        entryRenderSecondLine: function(node){
            let metaData = node.getMetadata();
            let pieces = [];
            if(metaData.get("ajxp_description")){
                pieces.push(<span className="metadata_chunk metadata_chunk_description">{metaData.get('ajxp_description')}</span>);
            }

            var first = false;
            var attKeys = Object.keys(this.state.columns);
            for(var i = 0; i<attKeys.length;i++ ){
                var s = attKeys[i];
                let label;
                if(s === 'ajxp_label' || s === 'text'){
                    continue;
                }else if(s=="ajxp_modiftime"){
                    var date = new Date();
                    date.setTime(parseInt(metaData.get(s))*1000);
                    label = PathUtils.formatModifDate(date);
                }else if(s == "ajxp_dirname" && metaData.get("filename")){
                    var dirName = getRepName(metaData.get("filename"));
                    label =  dirName?dirName:"/" ;
                }else if(s == "filesize" && metaData.get(s) == "-"){
                    continue;
                }else{
                    var metaValue = metaData.get(s) || "";
                    if(!metaValue) continue;
                    label = metaValue;
                }
                let sep;
                if(!first){
                    sep = <span className="icon-angle-right"></span>;
                }
                let cellClass = 'metadata_chunk metadata_chunk_standard metadata_chunk_' + s;
                pieces.push(<span className={cellClass}>{sep}<span className="text_label">{label}</span></span>);
                /*
                Modifier to be changed to react
                if(attributeList.get(s).modifierFunc){
                    attributeList.get(s).modifierFunc(cell, ajxpNode, 'detail', attributeList.get(s), largeRow);
                }
                */
            }
            return pieces;

        },

        renderDisplaySwitcher: function(){
            var modes = ['list', 'grid-160', 'grid-320', 'detail', 'grid-80'];
            let nextMode = function(){
                let current = this.state.displayMode;
                let i = modes.indexOf(current);
                let dMode = modes[(i == (modes.length - 1) ? 0 : i+1)];
                if(dMode.indexOf('grid-') === 0){
                    let near = parseInt(dMode.split('-')[1]);
                    this.recomputeThumbnailsDimension(near);
                }
                this.setState({displayMode: dMode});
            }.bind(this);
            return (<ReactMUI.FontIcon
                tooltip="Display Mode"
                className={"icon-th-large"}
                onClick={nextMode}
            />);
        },

        render: function(){

            let tableKeys, elementStyle, className = 'main-file-list layout-fill';
            let elementHeight, entryRenderSecondLine, elementsPerLine = 1, near;
            let dMode = this.state.displayMode;
            if(dMode.indexOf('grid-') === 0){
                near = parseInt(dMode.split('-')[1]);
                dMode = 'grid';
            }
            let infiniteSliceCount = 50;

            if(dMode === 'detail'){

                elementHeight = ReactPydio.SimpleList.HEIGHT_ONE_LINE;
                tableKeys = this.state.columns;

            } else if(dMode === 'grid'){

                className += ' material-list-grid grid-size-' + near;
                elementHeight =  Math.ceil(this.state.thumbSize / this.state.elementsPerLine);
                elementsPerLine = this.state.elementsPerLine;
                elementStyle={
                    width: this.state.thumbSize,
                    height: this.state.thumbSize
                };
                // Todo: compute a more real number of elements visible per page.
                if(near === 320) infiniteSliceCount = 25;
                else if(near === 160) infiniteSliceCount = 80;
                else if(near === 80) infiniteSliceCount = 200;

            } else if(dMode === 'list'){

                elementHeight = ReactPydio.SimpleList.HEIGHT_TWO_LINES;
                entryRenderSecondLine = this.entryRenderSecondLine.bind(this);

            }

            return (
                <ReactPydio.SimpleList
                    ref="list"
                    tableKeys={tableKeys}
                    node={this.state.contextNode}
                    dataModel={this.props.pydio.getContextHolder()}
                    openEditor={this.selectNode}
                    openCollection={this.selectNode}
                    externalResize={true}
                    className={className}
                    actionBarGroups={["get"]}
                    infiniteSliceCount={infiniteSliceCount}
                    elementsPerLine={elementsPerLine}
                    elementHeight={elementHeight}
                    elementStyle={elementStyle}
                    passScrollingStateToChildren={true}
                    entryRenderIcon={this.entryRenderIcon}
                    entryRenderSecondLine={entryRenderSecondLine}
                    additionalActions={[this.renderDisplaySwitcher()]}
                />
            );
        }

    });


    var FakeDndBackend = function(){
        return{
            setup:function(){},
            teardown:function(){},
            connectDragSource:function(){},
            connectDragPreview:function(){},
            connectDropTarget:function(){}
        };
    };

    let ns = global.WSComponents || {};
    if(global.ReactDND){
        ns.MainFilesList = ReactDND.DragDropContext(FakeDndBackend)(MainFilesList);
    }else{
        ns.MainFilesList = MainFilesList;
    }
    global.WSComponents = ns;

})(window);