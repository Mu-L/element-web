/*
Copyright 2015 OpenMarket Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';

var MatrixClientPeg = require("../../MatrixClientPeg");

var dis = require("../../dispatcher");

var PAGINATE_SIZE = 20;
var INITIAL_SIZE = 100;

module.exports = {
    getInitialState: function() {
        return {
            room: MatrixClientPeg.get().getRoom(this.props.roomId),
            messageCap: INITIAL_SIZE
        }
    },

    componentWillMount: function() {
        this.dispatcherRef = dis.register(this.onAction);
        MatrixClientPeg.get().on("Room.timeline", this.onRoomTimeline);
        this.atBottom = true;
    },

    componentWillUnmount: function() {
        dis.unregister(this.dispatcherRef);
        if (MatrixClientPeg.get()) {
            MatrixClientPeg.get().removeListener("Room.timeline", this.onRoomTimeline);
        }
    },

    onAction: function(payload) {
        switch (payload.action) {
            case 'message_sent':
                this.setState({
                    room: MatrixClientPeg.get().getRoom(this.props.roomId)
                });
                break;
        }
    },

    // MatrixRoom still showing the messages from the old room?
    // Set the key to the room_id. Sadly you can no longer get at
    // the key from inside the component, or we'd check this in code.
    /*componentWillReceiveProps: function(props) {
    },*/

    onRoomTimeline: function(ev, room, toStartOfTimeline) {
        if (!this.isMounted()) return;

        // ignore anything that comes in whilst pagingating: we get one
        // event for each new matrix event so this would cause a huge
        // number of UI updates. Just update the UI when the paginate
        // call returns.
        if (this.state.paginating) return;

        // no point handling anything while we're waiting for the join to finish:
        // we'll only be showing a spinner.
        if (this.state.joining) return;
        if (room.roomId != this.props.roomId) return;
        
        if (this.refs.messageList) {
            var messageUl = this.refs.messageList.getDOMNode();
            this.atBottom = messageUl.scrollHeight - messageUl.scrollTop <= messageUl.clientHeight;
        }
        this.setState({
            room: MatrixClientPeg.get().getRoom(this.props.roomId)
        });

        if (toStartOfTimeline && !this.state.paginating) {
            this.fillSpace();
        }
    },

    componentDidMount: function() {
        if (this.refs.messageList) {
            var messageUl = this.refs.messageList.getDOMNode();
            messageUl.scrollTop = messageUl.scrollHeight;

            this.fillSpace();
        }
    },

    componentDidUpdate: function() {
        if (!this.refs.messageList) return;

        var messageUl = this.refs.messageList.getDOMNode();

        if (this.state.paginating && !this.waiting_for_paginate) {
            var heightGained = messageUl.scrollHeight - this.oldScrollHeight;
            messageUl.scrollTop += heightGained;
            this.oldScrollHeight = undefined;
            if (!this.fillSpace()) {
                this.setState({paginating: false});
            }
        } else if (this.atBottom) {
            messageUl.scrollTop = messageUl.scrollHeight;
        }
    },

    fillSpace: function() {
        var messageUl = this.refs.messageList.getDOMNode();
        if (messageUl.scrollTop < messageUl.clientHeight && this.state.room.oldState.paginationToken) {
            this.setState({paginating: true});

            this.oldScrollHeight = messageUl.scrollHeight;

            if (this.state.messageCap < this.state.room.timeline.length) {
                this.waiting_for_paginate = false;
                var cap = Math.min(this.state.messageCap + PAGINATE_SIZE, this.state.room.timeline.length);
                this.setState({messageCap: cap, paginating: true});
            } else {
                this.waiting_for_paginate = true;
                var cap = this.state.messageCap + PAGINATE_SIZE;
                this.setState({messageCap: cap, paginating: true});
                var that = this;
                MatrixClientPeg.get().scrollback(this.state.room, PAGINATE_SIZE).finally(function() {
                    that.waiting_for_paginate = false;
                    if (that.isMounted()) {
                        that.setState({
                            room: MatrixClientPeg.get().getRoom(that.props.roomId)
                        });
                    }
                    // wait and set paginating to false when the component updates
                });
            }

            return true;
        }
        return false;
    },

    onJoinButtonClicked: function(ev) {
        var that = this;
        MatrixClientPeg.get().joinRoom(this.props.roomId).then(function() {
            that.setState({
                joining: false,
                room: MatrixClientPeg.get().getRoom(that.props.roomId)
            });
        }, function(error) {
            that.setState({
                joining: false,
                joinError: error
            });
        });
        this.setState({
            joining: true
        });
    },

    onMessageListScroll: function(ev) {
        if (this.refs.messageList) {
            var messageUl = this.refs.messageList.getDOMNode();
            this.atBottom = messageUl.scrollHeight - messageUl.scrollTop <= messageUl.clientHeight;
        }
        if (!this.state.paginating) this.fillSpace();
    }
};

