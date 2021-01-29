/* eslint-disable no-use-before-define */
import React, { Component } from 'react'
import { RouteComponentProps } from 'react-router'
import { Cat, Gender } from '../model/Cat'

class CatState extends Cat {
  submitted: boolean = false
  created: boolean = false
}

export class CatCreationComponent extends Component<RouteComponentProps<any>> {
  initialFormState: CatState = {
    _id: '',
    name: '',
    gender: Gender.MALE,
    birthdate: new Date(),
    submitted: false,
    created: false
  };

  state: CatState;
  constructor (props: RouteComponentProps<any>) {
    super(props)
    this.state = this.initialFormState
    this.create = this.create.bind(this)
    this.handleInputChange = this.handleInputChange.bind(this)
  }

  create (event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = {
      name: this.state.name,
      gender: this.state.gender,
      birthdate: this.state.birthdate
    }
    console.log(JSON.stringify(data))
    fetch('/api/cats', {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(data)
    }).then(response => {
      // Handle in better way the errors....
      return response.status === 201
    }).catch(e => {
      console.log(e)
    })
    // Redirect
  }

  handleInputChange (event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target
    this.setState(
      { ...this.state, [name]: value })
  }

  render () {
    return (
      <form onSubmit={this.create}>
        <label>Name</label>
        <input type="text" name="name" value={this.state.name} onChange={this.handleInputChange} /><br/>
        <label>Genre</label>
        <input type="text" name="gender" value={this.state.gender} onChange={this.handleInputChange} /><br/>
        <input type="submit" value="Ajouter"/>
      </form>
    )
  }
}
