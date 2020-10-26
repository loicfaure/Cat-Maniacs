/* eslint-disable no-use-before-define */
import React, { Component } from 'react'
import { RouteComponentProps } from 'react-router'

import { Cat } from '../model/Cat'

export class CatViewComponent extends Component<RouteComponentProps<any>> {
  async componentDidMount () {
    fetch('/api/cats/' + this.props.match.params.id)
      .then(res => res.json())
      .then(res => this.setState(res))
  }

  render () {
    const cat = this.state as Cat
    console.log(cat)
    return (
      <div>
        {cat?.name}
      </div>
    )
  }
}
