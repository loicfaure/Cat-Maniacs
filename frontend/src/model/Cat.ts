export enum Gender {
  MALE = 0,
  FEMALE = 1
}

export class Cat {
    _id: string
    name: string
    gender: Gender = Gender.MALE
    birthdate: Date = new Date()
    constructor (id: string, name: string) {
      this._id = id
      this.name = name
    }
}
