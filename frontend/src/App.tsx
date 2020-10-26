/* eslint-disable no-use-before-define */
import React, { Component } from 'react'
import { BrowserRouter as Router, Switch, Route, Link } from 'react-router-dom'
import { CatListComponent } from './components/CatListComponent'
import { CatViewComponent } from './components/CatViewComponent'
import './App.css'

class App extends Component {
  render () {
    return (
      <Router>
        <header className="w3-container w3-center w3-padding-32">
          <h1>Cha&apos;mania</h1>
          <nav>
            <ul>
              <li><Link to={'/cats'}>Chats</Link></li>
            </ul>
          </nav>
        </header>
        <section className="w3-col l8 s12">
          <Switch>
            <Route exact path='/cats' component={CatListComponent} key="catList"/>
            <Route path="/cats/:id" component={CatViewComponent} key="catView"/>
          </Switch>
        </section>
        <footer>

        </footer>
      </Router>
    )
  }
}

export default App
