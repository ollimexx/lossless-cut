
import React from "react";
const ReactDOM = require('react-dom');


class Sequencer extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true
        };
        this.renderItems = this.renderItems.bind(this);
        this.onDrop = this.onDrop.bind(this);
    }

    componentDidMount() {
        this.props.onRef(this)
    }

    componentWillUnmount() {
        this.props.onRef(undefined)
    }
    /*
    setSelected(key) {
        this.setState({ selectedKey: key });
    }
    */
    delete(key) {
        this.props.delete(key);
    }

    doubleClick(key) {
        this.props.onDoubleClick(key);
    }

    onDrop(event) {
        console.log('synthetic  ' + event.nativeEvent.pageX);
        console.log('scroll  ' + event.nativeEvent.clientX);

        event.preventDefault();
        var data;

        try {
            data = JSON.parse(event.dataTransfer.getData('text'));
        } catch (e) {
            // If the text data isn't parsable we'll just ignore it.
            return;
        }

        // Do something with the data
        console.log('dropped');
        console.log(data);
        var beforeKey = -1;   
        for (var i = 0; i < this.props.entries.length; i++) {
            var item = this.props.entries[i];
            var n = ReactDOM.findDOMNode(this.refs[item.key]);
            var rect = n.getBoundingClientRect();
            console.log( rect);
            if (event.nativeEvent.pageX < (rect.x + (rect.width / 2))) {
                console.log('chosen: ');
                console.log(rect);
                beforeKey = item.key;
                break;
            }
        }
        if (beforeKey != data.key) {
            this.props.onDrop(data.key, beforeKey);
        }
        /*
        const items = this.props.children;
        console.log(this.props.children);
        React.Children.map(items, (item,i) => {
            
            console.log(item);
        })*/
    }

    onDragStart(event, key) {
        var data = {
            key: key            
        };

        event.dataTransfer.setData('text', JSON.stringify(data)); 
        console.log(event.dataTransfer);
    }


    renderItems(item) {
        var borderStyle = 'lightgrey';
        if (item.key == this.props.selectedKey)
            borderStyle = 'red';

        return <img className="sequencerimg"
            onContextMenu={() => this.delete(item.key)}
            onDoubleClick={() => this.doubleClick(item.key)}
            key={item.key}
            ref={item.key}
            height={30}
            src={item.dataUri}  
            style={{ borderColor: borderStyle }}

            draggable='true'
            onDragStart={(event) => this.onDragStart(event, item.key)}
            />
    }

    render() {
        var entries = this.props.entries;
        var listItems = entries.map(this.renderItems);

        return (
            <div
                className="sequencer"
                id="seq"
                onDrop={this.onDrop}>
                {listItems}
            </div>
        );
    }

  
}

export default Sequencer;

