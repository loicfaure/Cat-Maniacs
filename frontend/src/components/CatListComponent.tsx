/* eslint-disable no-use-before-define */
import React, { Component } from 'react'
import { Cat } from '../model/Cat'
import { Link } from 'react-router-dom'

type CatState = {
  cat: Cat
}

export class SimpleCatComponent extends Component<CatState> {
  state: Cat
  constructor (props: CatState) {
    super(props)
    this.state = props.cat
  }

  render () {
    return (
      <div>
        <Link to={'/cats/' + this.state._id} className="nav-link">{this.state.name}</Link>
      </div>
    )
  }
}

export class CatListComponent extends Component {
  state = {
    cats: [] as Cat[]
  };

  async componentDidMount () {
    const response = await fetch('/api/cats')
    const body = await response.json()
    console.log(body)
    this.setState({ cats: body })
  }

  render () {
    const { cats } = this.state
    return (
      <div>
        <h2>Chats</h2>
        <Link to={'/cats/new'}>Nouveau</Link>
        {cats.map(cat =>
          <SimpleCatComponent cat={cat} key={cat._id} />
        )}
      </div>
    )
  }
}
